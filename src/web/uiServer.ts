import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

import { loadConfig } from "../config";
import { BackupService } from "../services/backupService";
import { FilenStorageProvider } from "../services/filenStorageProvider";
import { RestoreService } from "../services/restoreService";
import { createHaBackup, deleteHaBackup, isSupervisorAvailable, sendHaFailureNotification } from "../services/supervisorService";
import { logDebug, logError, logInfo, logWarn } from "../utils/logger";

type JsonRecord = Record<string, unknown>;

type BackupNowState =
  | { status: "idle" }
  | { status: "running"; startedAt: string }
  | { status: "done"; startedAt: string; finishedAt: string; result: JsonRecord }
  | { status: "error"; startedAt: string; finishedAt: string; error: string };

let backupNowState: BackupNowState = { status: "idle" };

type RestoreNowState =
  | { status: "idle" }
  | { status: "running"; startedAt: string; backupLocation: string; restoreDirectory?: string }
  | { status: "done"; startedAt: string; finishedAt: string; backupLocation: string; restoreDirectory?: string; result: JsonRecord }
  | { status: "error"; startedAt: string; finishedAt: string; backupLocation: string; restoreDirectory?: string; error: string };

let restoreNowState: RestoreNowState = { status: "idle" };

type SchedulerState = {
  enabled: boolean;
  intervalDays?: number;
  timeOfDay?: string;
  nextRunAt: string | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunStatus: "idle" | "done" | "error" | "running";
  lastError: string | null;
};

let schedulerState: SchedulerState = {
  enabled: false,
  nextRunAt: null,
  lastRunStartedAt: null,
  lastRunFinishedAt: null,
  lastRunStatus: "idle",
  lastError: null,
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

type BackupListItem = {
  name: string;
  path?: string;
  sizeBytes: number;
  modifiedAt: string;
};

type BackupOverview = {
  totalCount: number;
  totalSizeBytes: number;
  newestModifiedAt: string | null;
};

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const STATIC_FILES = ["/setup.html", "/backups.html", "/app.css", "/setup.js", "/backups.js"];

const DEFAULT_OPTIONS: JsonRecord = {
  source_directory: "/backup",
  working_directory: "/tmp/hassio-filen-backup",
  restore_directory: "/restore",
  encryption_passphrase: "",
  storage_provider: "filen",
  max_backups_in_filen_drive: 5,
  days_between_backups: 3,
  backup_time_of_day: "13:30",
  delete_after_upload: true,
  backup_name: "{type} Backup HA {version_ha}",
  generational_days: 3,
  generational_weeks: 4,
  send_error_reports: true,
  exclude_folders: "homeassistant,ssl,share,addons/local,media",
  exclude_addons: "core_configurator",
  filen_email: "",
  filen_password: "",
  filen_2fa_code: "",
  filen_target_folder: "/Home Assistant Backups",
  filen_auth_state_path: "/data/filen-auth-state.json",
};

export async function startUiServer(port: number): Promise<void> {
  logInfo("ui", "UI server starting", {
    port,
    optionsPath: getOptionsPath(),
    uiDebug: process.env.UI_DEBUG ?? "",
    uiLogPath: process.env.UI_LOG_PATH ?? "",
  });

  initializeScheduler();

  const server = createServer(async (req, res) => {
    try {
      await routeRequest(req, res);
    } catch (error: unknown) {
      logError("ui", "Unhandled route error", {
        error: error instanceof Error ? error.message : String(error),
      });

      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Unbekannter Serverfehler",
      });
    }
  });

  await new Promise<void>((resolveServer) => {
    server.listen(port, "0.0.0.0", () => {
      process.stdout.write(`UI server running on port ${port}\n`);
      resolveServer();
    });
  });
}

async function routeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";
  const path = normalizeRoutePath(url);
  logInfo("ui", "Request received", { method, url, normalizedPath: path });

  if (method === "GET" && path === "/") {
    serveStatic("/setup.html", res);
    return;
  }

  if (method === "GET" && path === "/api/options") {
    sendJson(res, 200, readOptions());
    return;
  }

  if (method === "POST" && path === "/api/options") {
    const payload = await readJsonBody(req);
    const merged = {
      ...readOptions(),
      ...payload,
      storage_provider: "filen",
    };

    validateOptions(merged);
    writeOptions(merged);
    initializeScheduler();

    sendJson(res, 200, { message: "Konfiguration gespeichert." });
    return;
  }

  if (method === "POST" && path === "/api/setup-filen-auth") {
    const config = loadConfig(getOptionsPath());

    if (config.storage.type !== "filen" || !config.storage.filen) {
      sendJson(res, 400, { error: "storage_provider muss auf filen stehen." });
      return;
    }

    const provider = new FilenStorageProvider(config.storage.filen);
    const setupResult = await provider.initializeAuthState();

    sendJson(res, 200, {
      message: "Filen Auth-State erfolgreich gespeichert.",
      ...setupResult,
    });
    return;
  }

  if (method === "GET" && path === "/api/backups") {
    sendJson(res, 200, await listBackups());
    return;
  }

  if (method === "GET" && path === "/api/scheduler-status") {
    sendJson(res, 200, getSchedulerStatusPayload());
    return;
  }

  if (method === "POST" && path === "/api/backup-now") {
    const triggerResult = startBackupRun("manual");

    if (!triggerResult.accepted) {
      sendJson(res, 409, { error: "Backup läuft bereits." });
      return;
    }

    sendJson(res, 202, { message: "Backup gestartet.", startedAt: triggerResult.startedAt });
    return;
  }

  if (method === "POST" && path === "/api/restore-preview") {
    const payload = await readJsonBody(req);
    const backupLocation = String(payload.backupLocation ?? "").trim();

    if (!backupLocation) {
      sendJson(res, 400, { error: "backupLocation fehlt." });
      return;
    }

    const maxEntries = toPositiveInteger(payload.maxEntries, 120);
    const config = loadConfig(getOptionsPath());
    const restoreService = new RestoreService(config);
    const preview = await restoreService.previewRestore(backupLocation, maxEntries);

    sendJson(res, 200, preview as unknown as JsonRecord);
    return;
  }

  if (method === "POST" && path === "/api/restore-now") {
    if (restoreNowState.status === "running") {
      sendJson(res, 409, { error: "Restore läuft bereits." });
      return;
    }

    const payload = await readJsonBody(req);
    const backupLocation = String(payload.backupLocation ?? "").trim();
    const restoreDirectory = String(payload.restoreDirectory ?? "").trim() || undefined;

    if (!backupLocation) {
      sendJson(res, 400, { error: "backupLocation fehlt." });
      return;
    }

    const startedAt = new Date().toISOString();
    restoreNowState = { status: "running", startedAt, backupLocation, restoreDirectory };

    void (async () => {
      try {
        const config = loadConfig(getOptionsPath());
        const restoreService = new RestoreService(config);
        const result = await restoreService.runRestore(backupLocation, restoreDirectory);

        restoreNowState = {
          status: "done",
          startedAt,
          finishedAt: new Date().toISOString(),
          backupLocation,
          restoreDirectory,
          result: result as unknown as JsonRecord,
        };
        logInfo("ui", "Restore abgeschlossen", { backupLocation, restoreDirectory });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        restoreNowState = {
          status: "error",
          startedAt,
          finishedAt: new Date().toISOString(),
          backupLocation,
          restoreDirectory,
          error: message,
        };
        logError("ui", "Restore fehlgeschlagen", { backupLocation, restoreDirectory, error: message });
      }
    })();

    sendJson(res, 202, { message: "Restore gestartet.", startedAt });
    return;
  }

  if (method === "GET" && path === "/api/backup-status") {
    sendJson(res, 200, backupNowState);
    return;
  }

  if (method === "GET" && path === "/api/restore-status") {
    sendJson(res, 200, restoreNowState as unknown as JsonRecord);
    return;
  }

  if (method === "GET" && path === "/info") {
    sendJson(res, 200, {
      name: "Filen Drive Backup",
      slug: "filen_drive_backup",
      ui: "./",
      documentation: "https://github.com/tom71/filen-drive-backup-addon/blob/main/README.md",
      issue_tracker: "https://github.com/tom71/filen-drive-backup-addon/issues",
    });
    return;
  }

  if (method === "GET" && path === "/documentation") {
    redirect(res, "https://github.com/tom71/filen-drive-backup-addon/blob/main/README.md");
    return;
  }

  if (method === "GET") {
    serveStatic(path, res);
    return;
  }

  sendJson(res, 404, { error: "Route nicht gefunden." });
}

function serveStatic(urlPath: string, res: ServerResponse): void {
  const webRoot = getWebRoot();
  const safePath = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
  const target = resolve(webRoot, safePath);

  logInfo("ui", "serveStatic", { urlPath, webRoot, safePath, target, exists: existsSync(target) });

  if (!target.startsWith(webRoot) || !existsSync(target)) {
    logInfo("ui", "serveStatic 404", { target, startsWithRoot: target.startsWith(webRoot), exists: existsSync(target) });
    sendJson(res, 404, { error: "Datei nicht gefunden." });
    return;
  }

  const body = readFileSync(target);
  const ext = extname(target).toLowerCase();
  const mime = MIME_TYPES[ext] ?? "application/octet-stream";

  res.statusCode = 200;
  res.setHeader("Content-Type", mime);
  res.end(body);
}

function getWebRoot(): string {
  // Prefer location relative to compiled runtime file (works in HA add-on containers).
  const runtimeRelativeRoot = resolve(__dirname, "../../web");

  logInfo("ui", "getWebRoot probe", {
    __dirname,
    runtimeRelativeRoot,
    exists: existsSync(runtimeRelativeRoot),
    cwd: process.cwd(),
  });

  if (existsSync(runtimeRelativeRoot)) {
    return runtimeRelativeRoot;
  }

  // Fallback for local execution modes.
  const cwdRoot = resolve(process.cwd(), "web");
  logInfo("ui", "getWebRoot fallback", { cwdRoot, exists: existsSync(cwdRoot) });
  return cwdRoot;
}

function normalizeRoutePath(rawUrl: string): string {
  const pathname = new URL(rawUrl, "http://localhost").pathname;
  const API_ROUTES = [
    "/api/options",
    "/api/setup-filen-auth",
    "/api/backups",
    "/api/scheduler-status",
    "/api/backup-now",
    "/api/backup-status",
    "/api/restore-preview",
    "/api/restore-now",
    "/api/restore-status",
  ];

  if (pathname === "/") {
    return "/";
  }

  for (const apiRoute of API_ROUTES) {
    const routeIndex = pathname.indexOf(apiRoute);
    if (routeIndex >= 0) {
      return pathname.slice(routeIndex);
    }
  }

  // Handle HA ingress patterns before generic /api passthrough.
  if (
    pathname.startsWith("/hassio_ingress/") ||
    pathname.startsWith("/api/hassio_ingress/") ||
    pathname.startsWith("/hassio/ingress/")
  ) {
    const appIndex = pathname.indexOf("/app");
    const setupIndex = pathname.indexOf("/setup");
    const backupsIndex = pathname.indexOf("/backups");
    const infoIndex = pathname.indexOf("/info");
    const docsIndex = pathname.indexOf("/documentation");

    if (appIndex >= 0) {
      return "/";
    }

    if (setupIndex >= 0) {
      return "/";
    }

    if (backupsIndex >= 0) {
      return "/backups.html";
    }

    if (infoIndex >= 0) {
      return "/info";
    }

    if (docsIndex >= 0) {
      return "/documentation";
    }

    // Ingress base paths like /api/hassio_ingress/<token>/ should render UI root.
    return "/";
  }

  if (pathname.startsWith("/api/")) {
    return pathname;
  }

  const apiIndex = pathname.indexOf("/api/");
  if (apiIndex >= 0) {
    return pathname.slice(apiIndex);
  }

  for (const filePath of STATIC_FILES) {
    if (pathname === filePath || pathname.endsWith(filePath)) {
      return filePath;
    }
  }

  if (pathname === "/setup" || pathname.endsWith("/setup")) {
    return "/setup.html";
  }

  if (pathname === "/backups" || pathname.endsWith("/backups")) {
    return "/backups.html";
  }

  if (pathname === "/info" || pathname.endsWith("/info")) {
    return "/info";
  }

  if (pathname === "/documentation" || pathname.endsWith("/documentation")) {
    return "/documentation";
  }

  // Handle HA ingress app patterns: /app/[slug] or /app/[instance-id]_[slug]
  // These should redirect to setup page
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    return "/";
  }

  return pathname;
}

function getOptionsPath(): string {
  return resolve(process.env.UI_CONFIG_PATH ?? process.env.CONFIG_PATH ?? "config/config.json");
}

function readOptions(): JsonRecord {
  const optionsPath = getOptionsPath();

  if (!existsSync(optionsPath)) {
    return { ...DEFAULT_OPTIONS };
  }

  const parsed = JSON.parse(readFileSync(optionsPath, "utf8")) as JsonRecord;

  return {
    ...DEFAULT_OPTIONS,
    ...parsed,
  };
}

function writeOptions(options: JsonRecord): void {
  const optionsPath = getOptionsPath();
  mkdirSync(dirname(optionsPath), { recursive: true });
  writeFileSync(optionsPath, `${JSON.stringify(options, null, 2)}\n`, "utf8");
}

function validateOptions(options: JsonRecord): void {
  if (!options.encryption_passphrase || String(options.encryption_passphrase).trim().length === 0) {
    throw new Error("encryption_passphrase darf nicht leer sein.");
  }

  const provider = String(options.storage_provider ?? "").trim();

  if (provider !== "filen") {
    throw new Error("storage_provider muss filen sein.");
  }

  const backupTimeOfDay = String(options.backup_time_of_day ?? "").trim();
  if (backupTimeOfDay.length > 0 && !/^([01]\d|2[0-3]):[0-5]\d$/.test(backupTimeOfDay)) {
    throw new Error("backup_time_of_day muss im Format HH:MM vorliegen.");
  }
}

async function listBackups(): Promise<JsonRecord> {
  const options = readOptions();
  const provider = String(options.storage_provider ?? "filen");
  logInfo("ui", "Loading backups", { provider });

  const config = loadConfig(getOptionsPath());

  if (!config.storage.filen) {
    logWarn("ui", "Filen selected but config.storage.filen missing");
    return {
      provider,
      items: [],
      overview: buildOverview([]),
      note: "Filen ist nicht vollstaendig konfiguriert.",
    };
  }

  try {
    const filenProvider = new FilenStorageProvider(config.storage.filen);
    const remote = await filenProvider.listBackupFiles();
    logInfo("ui", "Filen backup listing finished", {
      targetFolder: remote.targetFolder,
      count: remote.items.length,
    });

    return {
      provider,
      baseDirectory: remote.targetFolder,
      items: remote.items,
      overview: buildOverview(remote.items),
      storage: remote.storage,
    };
  } catch (error: unknown) {
    logError("ui", "Filen backup listing failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      provider,
      items: [],
      overview: buildOverview([]),
      note: error instanceof Error ? error.message : "Filen-Backups konnten nicht geladen werden.",
    };
  }
}

function readBooleanOption(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function buildOverview(items: BackupListItem[]): BackupOverview {
  const totalSizeBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);

  if (items.length === 0) {
    return {
      totalCount: 0,
      totalSizeBytes,
      newestModifiedAt: null,
    };
  }

  const newestModifiedAt = items
    .map((item) => item.modifiedAt)
    .sort((a, b) => b.localeCompare(a))[0] ?? null;

  return {
    totalCount: items.length,
    totalSizeBytes,
    newestModifiedAt,
  };
}

async function readJsonBody(req: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as JsonRecord;
}

function sendJson(res: ServerResponse, statusCode: number, payload: JsonRecord): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function redirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

function initializeScheduler(): void {
  const options = readOptions();
  const intervalDays = toPositiveInteger(options.days_between_backups);
  const timeOfDay = String(options.backup_time_of_day ?? "").trim();
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay) ? timeOfDay : undefined;

  schedulerState.enabled = Boolean(intervalDays && validTime);
  schedulerState.intervalDays = intervalDays;
  schedulerState.timeOfDay = validTime;
  schedulerState.nextRunAt = schedulerState.enabled ? computeNextRunIso(new Date(), intervalDays!, validTime!) : null;

  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  if (!schedulerState.enabled) {
    logInfo("ui", "Scheduler deaktiviert", { intervalDays, timeOfDay });
    return;
  }

  schedulerTimer = setInterval(() => {
    void runScheduledBackupIfDue();
  }, 30_000);

  logInfo("ui", "Scheduler aktiviert", {
    intervalDays: schedulerState.intervalDays,
    timeOfDay: schedulerState.timeOfDay,
    nextRunAt: schedulerState.nextRunAt,
  });
}

async function runScheduledBackupIfDue(): Promise<void> {
  if (!schedulerState.enabled || !schedulerState.nextRunAt) {
    return;
  }

  if (backupNowState.status === "running") {
    return;
  }

  const dueAt = new Date(schedulerState.nextRunAt).getTime();
  if (!Number.isFinite(dueAt) || Date.now() < dueAt) {
    return;
  }

  const triggerResult = startBackupRun("scheduled");
  if (!triggerResult.accepted && schedulerState.intervalDays && schedulerState.timeOfDay) {
    schedulerState.nextRunAt = computeNextRunIso(new Date(), schedulerState.intervalDays, schedulerState.timeOfDay);
  }
}

function startBackupRun(trigger: "manual" | "scheduled"): { accepted: boolean; startedAt?: string } {
  if (backupNowState.status === "running") {
    return { accepted: false };
  }

  const startedAt = new Date().toISOString();
  backupNowState = { status: "running", startedAt };
  schedulerState.lastRunStartedAt = startedAt;
  schedulerState.lastRunStatus = "running";
  schedulerState.lastError = null;

  logInfo("ui", `${trigger === "scheduled" ? "Geplantes" : "Manuelles"} Backup gestartet`, {
    startedAt,
  });

  void (async () => {
    const rawOptions = readOptions();
    const shouldNotifyOnFailure = readBooleanOption(rawOptions.send_error_reports, true);

    try {
      const config = loadConfig(getOptionsPath());
      const service = new BackupService(config);
      let result;

      if (isSupervisorAvailable()) {
        logInfo("ui", "Supervisor verfügbar – erstelle HA Backup via Supervisor API", {
          backupNameTemplate: config.backupPolicy.backupNameTemplate,
          excludeFolders: config.backupPolicy.excludeFolders,
          excludeAddons: config.backupPolicy.excludeAddons,
        });
        const createdBackup = await createHaBackup({
          backupNameTemplate: config.backupPolicy.backupNameTemplate,
          excludeFolders: config.backupPolicy.excludeFolders,
          excludeAddons: config.backupPolicy.excludeAddons,
        });
        const uploadName = `${createdBackup.name} - ${createdBackup.slug}.tar.enc`;
        result = await service.runBackupFromFile(createdBackup.tarPath, `${createdBackup.slug}.tar`, uploadName);

        if (config.backupPolicy.deleteAfterUpload) {
          await deleteHaBackup(createdBackup.slug);
        }
      } else {
        logInfo("ui", "Kein Supervisor – archiviere source_directory");
        result = await service.runBackup();
      }

      const finishedAt = new Date().toISOString();
      backupNowState = {
        status: "done",
        startedAt,
        finishedAt,
        result: result as unknown as JsonRecord,
      };

      schedulerState.lastRunFinishedAt = finishedAt;
      schedulerState.lastRunStatus = "done";
      schedulerState.lastError = null;
      if (schedulerState.enabled && schedulerState.intervalDays && schedulerState.timeOfDay) {
        schedulerState.nextRunAt = computeNextRunIso(new Date(), schedulerState.intervalDays, schedulerState.timeOfDay);
      }

      logInfo("ui", `${trigger === "scheduled" ? "Geplantes" : "Manuelles"} Backup abgeschlossen`, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const finishedAt = new Date().toISOString();
      backupNowState = {
        status: "error",
        startedAt,
        finishedAt,
        error: message,
      };

      schedulerState.lastRunFinishedAt = finishedAt;
      schedulerState.lastRunStatus = "error";
      schedulerState.lastError = message;
      if (schedulerState.enabled && schedulerState.intervalDays && schedulerState.timeOfDay) {
        schedulerState.nextRunAt = computeNextRunIso(new Date(), schedulerState.intervalDays, schedulerState.timeOfDay);
      }

      logError("ui", `${trigger === "scheduled" ? "Geplantes" : "Manuelles"} Backup fehlgeschlagen`, {
        error: message,
      });

      if (shouldNotifyOnFailure && isSupervisorAvailable()) {
        try {
          await sendHaFailureNotification(
            "Filen Drive Backup fehlgeschlagen",
            `Das ${trigger === "scheduled" ? "geplante" : "manuelle"} Backup konnte nicht abgeschlossen werden.\n\nFehler: ${message}`,
          );
        } catch (notifyError: unknown) {
          logError("ui", "HA Fehlerbenachrichtigung fehlgeschlagen", {
            error: notifyError instanceof Error ? notifyError.message : String(notifyError),
          });
        }
      }
    }
  })();

  return { accepted: true, startedAt };
}

function computeNextRunIso(now: Date, intervalDays: number, timeOfDay: string): string {
  const [hourPart, minutePart] = timeOfDay.split(":");
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);

  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);

  while (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + intervalDays);
  }

  return candidate.toISOString();
}

function getSchedulerStatusPayload(): JsonRecord {
  return {
    enabled: schedulerState.enabled,
    intervalDays: schedulerState.intervalDays,
    timeOfDay: schedulerState.timeOfDay,
    nextRunAt: schedulerState.nextRunAt,
    lastRunStartedAt: schedulerState.lastRunStartedAt,
    lastRunFinishedAt: schedulerState.lastRunFinishedAt,
    lastRunStatus: schedulerState.lastRunStatus,
    lastError: schedulerState.lastError,
  };
}

function toPositiveInteger(input: unknown, fallback?: number): number | undefined {
  if (typeof input === "number" && Number.isFinite(input) && input >= 1) {
    return Math.floor(input);
  }

  if (typeof input === "string" && input.trim().length > 0) {
    const parsed = Number.parseInt(input.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return parsed;
    }
  }

  return fallback;
}
