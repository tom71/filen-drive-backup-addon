import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

import { loadConfig } from "../config";
import { FilenStorageProvider } from "../services/filenStorageProvider";
import { logDebug, logError, logInfo, logWarn } from "../utils/logger";

type JsonRecord = Record<string, unknown>;

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

const DEFAULT_OPTIONS: JsonRecord = {
  source_directory: "/backup",
  working_directory: "/tmp/hassio-filen-backup",
  restore_directory: "/restore",
  encryption_passphrase: "",
  storage_provider: "local",
  local_storage_directory: "/share/filen-backups",
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
  logDebug("ui", "Request received", { method, url });

  if (method === "GET" && url === "/") {
    redirect(res, "/setup.html");
    return;
  }

  if (method === "GET" && url === "/api/options") {
    sendJson(res, 200, readOptions());
    return;
  }

  if (method === "POST" && url === "/api/options") {
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

  if (method === "POST" && url === "/api/setup-filen-auth") {
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

  if (method === "GET" && url === "/api/backups") {
    sendJson(res, 200, await listBackups());
    return;
  }

  if (method === "GET") {
    serveStatic(url, res);
    return;
  }

  sendJson(res, 404, { error: "Route nicht gefunden." });
}

function serveStatic(urlPath: string, res: ServerResponse): void {
  const webRoot = resolve(process.cwd(), "web");
  const safePath = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
  const target = resolve(webRoot, safePath);

  if (!target.startsWith(webRoot) || !existsSync(target)) {
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

  if (provider !== "local" && provider !== "filen") {
    throw new Error("storage_provider muss local oder filen sein.");
  }

  if (provider === "local" && String(options.local_storage_directory ?? "").trim().length === 0) {
    throw new Error("local_storage_directory darf bei local nicht leer sein.");
  }
}

async function listBackups(): Promise<JsonRecord> {
  const options = readOptions();
  const provider = String(options.storage_provider ?? "local");
  logInfo("ui", "Loading backups", { provider });

  if (provider === "filen") {
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

  if (provider !== "local") {
    logWarn("ui", "Unknown storage provider", { provider });
    return {
      provider,
      items: [],
      overview: buildOverview([]),
      note: "Unbekannter Provider.",
    };
  }

  const baseDir = String(options.local_storage_directory ?? "").trim();

  if (baseDir.length === 0 || !existsSync(baseDir)) {
    logWarn("ui", "Local backup directory not found", { baseDir });
    return {
      provider,
      items: [],
      overview: buildOverview([]),
      note: "Kein lokales Backup-Verzeichnis gefunden.",
    };
  }

  const items: BackupListItem[] = readdirSync(baseDir)
    .filter((name) => name.endsWith(".enc"))
    .map((name) => {
      const stat = statSync(join(baseDir, name));

      return {
        name,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  logInfo("ui", "Local backup listing finished", {
    baseDir,
    count: items.length,
  });

  return {
    provider,
    baseDirectory: baseDir,
    items,
    overview: buildOverview(items),
  };
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
