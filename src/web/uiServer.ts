import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

import { loadConfig } from "../config";
import { BackupService } from "../services/backupService";
import { FilenStorageProvider } from "../services/filenStorageProvider";
import { createHaFullBackup, isSupervisorAvailable } from "../services/supervisorService";
import { logDebug, logError, logInfo, logWarn } from "../utils/logger";

type JsonRecord = Record<string, unknown>;

type BackupNowState =
  | { status: "idle" }
  | { status: "running"; startedAt: string }
  | { status: "done"; startedAt: string; finishedAt: string; result: JsonRecord }
  | { status: "error"; startedAt: string; finishedAt: string; error: string };

let backupNowState: BackupNowState = { status: "idle" };

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
  filen_email: "",
  filen_password: "",
  filen_2fa_code: "",
  filen_target_folder: "/Home Assistant Backups",
  filen_auth_state_path: "/addon_configs/filen_drive_backup/filen-auth-state.json",
};

export async function startUiServer(port: number): Promise<void> {
  logInfo("ui", "UI server starting", {
    port,
    optionsPath: getOptionsPath(),
    uiDebug: process.env.UI_DEBUG ?? "",
    uiLogPath: process.env.UI_LOG_PATH ?? "",
  });

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
      ...DEFAULT_OPTIONS,
      ...payload,
    };

    validateOptions(merged);
    writeOptions(merged);

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

  if (method === "POST" && path === "/api/backup-now") {
    if (backupNowState.status === "running") {
      sendJson(res, 409, { error: "Backup läuft bereits." });
      return;
    }

    const startedAt = new Date().toISOString();
    backupNowState = { status: "running", startedAt };
    logInfo("ui", "Manuelles Backup gestartet");

    // Fire-and-forget – Client poolt /api/backup-status
    (async () => {
      try {
        const config = loadConfig(getOptionsPath());
        const service = new BackupService(config);
        let result;

        if (isSupervisorAvailable()) {
          logInfo("ui", "Supervisor verfügbar – erstelle HA Full Backup via Supervisor API");
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const backupName = `Filen-Backup-${timestamp}`;
          const tarPath = await createHaFullBackup(backupName);
          const baseName = `ha-backup-${timestamp}.tar`;
          result = await service.runBackupFromFile(tarPath, baseName);
        } else {
          logInfo("ui", "Kein Supervisor – archiviere source_directory");
          result = await service.runBackup();
        }

        backupNowState = {
          status: "done",
          startedAt,
          finishedAt: new Date().toISOString(),
          result: result as unknown as JsonRecord,
        };
        logInfo("ui", "Manuelles Backup abgeschlossen", result);
      } catch (err: unknown) {
        backupNowState = {
          status: "error",
          startedAt,
          finishedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        };
        logError("ui", "Manuelles Backup fehlgeschlagen", { error: backupNowState.error });
      }
    })();

    sendJson(res, 202, { message: "Backup gestartet.", startedAt });
    return;
  }

  if (method === "GET" && path === "/api/backup-status") {
    sendJson(res, 200, backupNowState);
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
  const API_ROUTES = ["/api/options", "/api/setup-filen-auth", "/api/backups", "/api/backup-now", "/api/backup-status"];

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
