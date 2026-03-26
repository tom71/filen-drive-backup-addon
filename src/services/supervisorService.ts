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

export function isSupervisorAvailable(): boolean {
  return Boolean(process.env.SUPERVISOR_TOKEN);
}

export async function createHaFullBackup(name: string): Promise<string> {
  logInfo("supervisor", "Erstelle HA Full Backup via Supervisor API", { name });

  const response = await supervisorRequest<BackupCreatedData>("POST", "/backups/new/full", { name });
  const slug = response.data.slug;

  logInfo("supervisor", "HA Backup erstellt", { slug });

  const tarPath = resolve("/backup", `${slug}.tar`);

  if (!existsSync(tarPath)) {
    throw new Error(`Backup-Datei nicht gefunden nach Erstellung: ${tarPath}`);
  }

  return tarPath;
}
