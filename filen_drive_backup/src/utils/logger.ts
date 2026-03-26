import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

function shouldLogDebug(): boolean {
  const value = (process.env.UI_DEBUG ?? process.env.FILEN_DEBUG ?? "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function logToFile(line: string): void {
  const path = process.env.UI_LOG_PATH;

  if (!path) {
    return;
  }

  try {
    const folder = dirname(path);

    if (!existsSync(folder)) {
      mkdirSync(folder, { recursive: true });
    }

    appendFileSync(path, `${line}\n`, "utf8");
  } catch {
    // Logging darf die App nie blockieren.
  }
}

function write(level: LogLevel, scope: string, message: string, details?: unknown): void {
  const timestamp = new Date().toISOString();
  const detailText = details === undefined ? "" : ` ${safeStringify(details)}`;
  const line = `[${timestamp}] [${level}] [${scope}] ${message}${detailText}`;

  process.stdout.write(`${line}\n`);
  logToFile(line);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"<unserializable>"';
  }
}

export function logInfo(scope: string, message: string, details?: unknown): void {
  write("INFO", scope, message, details);
}

export function logWarn(scope: string, message: string, details?: unknown): void {
  write("WARN", scope, message, details);
}

export function logError(scope: string, message: string, details?: unknown): void {
  write("ERROR", scope, message, details);
}

export function logDebug(scope: string, message: string, details?: unknown): void {
  if (!shouldLogDebug()) {
    return;
  }

  write("DEBUG", scope, message, details);
}
