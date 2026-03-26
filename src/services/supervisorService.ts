import { request } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { logInfo, logError } from "../utils/logger";

interface SupervisorResponse<T> {
  result: "ok" | "error";
  message?: string;
  data: T;
}

interface BackupCreatedData {
  slug: string;
}

interface CoreInfoData {
  version?: string;
}

interface AddonsData {
  addons?: Array<{ slug?: string }>;
}

type CreatedBackup = {
  slug: string;
  tarPath: string;
  name: string;
  kind: "full" | "partial";
};

const HA_BACKUP_FOLDERS = ["homeassistant", "ssl", "share", "addons/local", "media"];

function supervisorRequest<T>(method: string, path: string, body?: unknown): Promise<SupervisorResponse<T>> {
  const token = process.env.SUPERVISOR_TOKEN;

  if (!token) {
    return Promise.reject(new Error("SUPERVISOR_TOKEN nicht verfügbar."));
  }

  return new Promise((resolve: (value: SupervisorResponse<T>) => void, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    const req = request(
      {
        hostname: "supervisor",
        port: 80,
        path,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Supervisor-Token": token,
          "Content-Type": "application/json",
          ...(bodyStr !== undefined ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 400) {
            const message = raw.trim() || `Supervisor API Fehler (HTTP ${res.statusCode ?? "?"})`;

            if (res.statusCode === 403) {
              reject(new Error(`Supervisor verweigert den Zugriff (403). Dem Add-on fehlen wahrscheinlich hassio_api/hassio_role-Rechte. Antwort: ${message}`));
              return;
            }

            reject(new Error(message));
            return;
          }

          try {
            const parsed = JSON.parse(raw) as SupervisorResponse<T>;

            if (parsed.result !== "ok") {
              reject(new Error(parsed.message ?? `Supervisor API Fehler (HTTP ${res.statusCode ?? "?"})`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Ungültige Supervisor-Antwort: ${raw.slice(0, 200)}`));
          }
        });
      },
    );

    req.on("error", (err: Error) => {
      reject(new Error(`Supervisor HTTP Fehler: ${err.message}`));
    });

    if (bodyStr !== undefined) {
      req.write(bodyStr);
    }

    req.end();
  });
}

function homeAssistantRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = process.env.SUPERVISOR_TOKEN;

  if (!token) {
    return Promise.reject(new Error("SUPERVISOR_TOKEN nicht verfügbar."));
  }

  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;

    const req = request(
      {
        hostname: "supervisor",
        port: 80,
        path,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Supervisor-Token": token,
          "Content-Type": "application/json",
          ...(bodyStr !== undefined ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on("end", () => {
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(raw.trim() || `Home Assistant API Fehler (HTTP ${res.statusCode ?? "?"})`));
            return;
          }

          if (raw.trim().length === 0) {
            resolve(undefined);
            return;
          }

          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(raw);
          }
        });
      },
    );

    req.on("error", (err: Error) => {
      reject(new Error(`Home Assistant HTTP Fehler: ${err.message}`));
    });

    if (bodyStr !== undefined) {
      req.write(bodyStr);
    }

    req.end();
  });
}

export function isSupervisorAvailable(): boolean {
  return Boolean(process.env.SUPERVISOR_TOKEN);
}

export async function createHaBackup(options: {
  backupNameTemplate: string;
  excludeFolders: string[];
  excludeAddons: string[];
}): Promise<CreatedBackup> {
  const excludeFolders = new Set(options.excludeFolders);
  const excludeAddons = new Set(options.excludeAddons);
  const isPartial = excludeFolders.size > 0 || excludeAddons.size > 0;
  const kind = isPartial ? "partial" : "full";
  const typeLabel = isPartial ? "Partial" : "Full";
  const coreInfo = await supervisorRequest<CoreInfoData>("GET", "/core/info");
  const versionHa = String(coreInfo.data.version ?? "unknown");
  const name = options.backupNameTemplate
    .replaceAll("{type}", typeLabel)
    .replaceAll("{version_ha}", versionHa);

  let body: Record<string, unknown> = { name };
  let path = "/backups/new/full";

  if (isPartial) {
    const addonsResponse = await supervisorRequest<AddonsData>("GET", "/addons");
    const addons = (addonsResponse.data.addons ?? [])
      .map((addon) => addon.slug)
      .filter((slug): slug is string => typeof slug === "string" && slug.length > 0)
      .filter((slug) => !excludeAddons.has(slug));
    const folders = HA_BACKUP_FOLDERS.filter((folder) => !excludeFolders.has(folder));

    body = {
      name,
      addons,
      folders,
    };
    path = "/backups/new/partial";
  }

  logInfo("supervisor", "Erstelle HA Backup via Supervisor API", { name, kind, body });

  const response = await supervisorRequest<BackupCreatedData>("POST", path, body);
  const slug = response.data.slug;
  const tarPath = resolve("/backup", `${slug}.tar`);

  logInfo("supervisor", "HA Backup erstellt", { slug, kind, name });

  if (!existsSync(tarPath)) {
    throw new Error(`Backup-Datei nicht gefunden nach Erstellung: ${tarPath}`);
  }

  return { slug, tarPath, name, kind };
}

export async function deleteHaBackup(slug: string): Promise<void> {
  logInfo("supervisor", "Lösche HA Backup nach Upload", { slug });
  await supervisorRequest<Record<string, never>>("DELETE", `/backups/${slug}`);
}

export async function sendHaFailureNotification(title: string, message: string): Promise<void> {
  logError("ha", "Sende Home Assistant Fehlerbenachrichtigung", { title, message });
  await homeAssistantRequest("POST", "/core/api/services/persistent_notification/create", {
    title,
    message,
    notification_id: "filen_drive_backup_failure",
  });
}
