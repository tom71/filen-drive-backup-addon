import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AppConfig, StorageProviderType } from "./types/config";

interface RawConfig {
  sourceDirectory?: string;
  workingDirectory?: string;
  restoreDirectory?: string;
  encryption?: {
    passphrase?: string;
  };
  storage?: {
    type?: StorageProviderType;
    filen?: {
      apiKey?: string;
      email?: string;
      password?: string;
      twoFactorCode?: string;
      baseUrl?: string;
      targetFolder?: string;
      authStatePath?: string;
    };
  };
  source_directory?: string;
  working_directory?: string;
  restore_directory?: string;
  encryption_passphrase?: string;
  storage_provider?: StorageProviderType;
  filen_api_key?: string;
  filen_email?: string;
  filen_password?: string;
  filen_2fa_code?: string;
  filen_base_url?: string;
  filen_target_folder?: string;
  filen_auth_state_path?: string;
  max_backups_in_filen_drive?: number;
  days_between_backups?: number;
  backup_time_of_day?: string;
  delete_after_upload?: boolean;
  backup_name?: string;
  generational_days?: number;
  generational_weeks?: number;
  send_error_reports?: boolean;
  exclude_folders?: string;
  exclude_addons?: string;
}

export function loadConfig(configPath = process.env.CONFIG_PATH ?? "config/config.json"): AppConfig {
  const fileConfig = readConfigFile(configPath);

  const sourceDirectory =
    process.env.SOURCE_DIRECTORY ?? fileConfig.sourceDirectory ?? fileConfig.source_directory;
  const workingDirectory =
    process.env.WORKING_DIRECTORY ?? fileConfig.workingDirectory ?? fileConfig.working_directory ?? "/tmp/hassio-filen-backup";
  const restoreDirectory =
    process.env.RESTORE_DIRECTORY ?? fileConfig.restoreDirectory ?? fileConfig.restore_directory;
  const passphrase =
    process.env.ENCRYPTION_PASSPHRASE ??
    fileConfig.encryption?.passphrase ??
    fileConfig.encryption_passphrase;
  const storageType =
    (process.env.STORAGE_PROVIDER as StorageProviderType | undefined) ??
    fileConfig.storage?.type ??
    fileConfig.storage_provider ??
    "filen";
  const filenApiKey =
    process.env.FILEN_API_KEY ?? fileConfig.storage?.filen?.apiKey ?? fileConfig.filen_api_key;
  const filenEmail =
    process.env.FILEN_EMAIL ?? fileConfig.storage?.filen?.email ?? fileConfig.filen_email;
  const filenPassword =
    process.env.FILEN_PASSWORD ?? fileConfig.storage?.filen?.password ?? fileConfig.filen_password;
  const filenTwoFactorCode =
    process.env.FILEN_2FA_CODE ??
    fileConfig.storage?.filen?.twoFactorCode ??
    fileConfig.filen_2fa_code;
  const filenBaseUrl =
    process.env.FILEN_BASE_URL ?? fileConfig.storage?.filen?.baseUrl ?? fileConfig.filen_base_url;
  const filenTargetFolder =
    process.env.FILEN_TARGET_FOLDER ??
    fileConfig.storage?.filen?.targetFolder ??
    fileConfig.filen_target_folder;
  const filenAuthStatePath =
    process.env.FILEN_AUTH_STATE_PATH ??
    fileConfig.storage?.filen?.authStatePath ??
    fileConfig.filen_auth_state_path ??
    "/addon_configs/filen_drive_backup/filen-auth-state.json";
  const maxBackupsInFilenDrive = parseInteger(
    process.env.MAX_BACKUPS_IN_FILEN_DRIVE ?? fileConfig.max_backups_in_filen_drive,
  );
  const daysBetweenBackups = parseInteger(
    process.env.DAYS_BETWEEN_BACKUPS ?? fileConfig.days_between_backups,
  );
  const backupTimeOfDay =
    process.env.BACKUP_TIME_OF_DAY ?? fileConfig.backup_time_of_day ?? undefined;
  const deleteAfterUpload = parseBoolean(
    process.env.DELETE_AFTER_UPLOAD ?? fileConfig.delete_after_upload,
    true,
  );
  const backupNameTemplate =
    process.env.BACKUP_NAME ?? fileConfig.backup_name ?? "{type} Backup HA {version_ha}";
  const generationalDays = parseInteger(
    process.env.GENERATIONAL_DAYS ?? fileConfig.generational_days,
  );
  const generationalWeeks = parseInteger(
    process.env.GENERATIONAL_WEEKS ?? fileConfig.generational_weeks,
  );
  const sendErrorReports = parseBoolean(
    process.env.SEND_ERROR_REPORTS ?? fileConfig.send_error_reports,
    true,
  );
  const excludeFolders = parseCsv(
    process.env.EXCLUDE_FOLDERS ?? fileConfig.exclude_folders,
  );
  const excludeAddons = parseCsv(
    process.env.EXCLUDE_ADDONS ?? fileConfig.exclude_addons,
  );

  if (!passphrase) {
    throw new Error("encryption.passphrase fehlt in der Konfiguration.");
  }

  if (storageType !== "filen") {
    throw new Error("Dieses Add-on unterstuetzt nur noch storage_provider=filen.");
  }

  if (storageType === "filen" && !filenEmail && !filenApiKey && !filenAuthStatePath) {
    throw new Error("Fuer den Filen-Provider fehlt eine Auth-Quelle (filen.email oder filen_auth_state_path).");
  }

  return {
    sourceDirectory: sourceDirectory ? resolve(sourceDirectory) : undefined,
    workingDirectory: resolve(workingDirectory),
    restoreDirectory: restoreDirectory ? resolve(restoreDirectory) : undefined,
    encryption: {
      passphrase,
    },
    storage: {
      type: storageType,
      filen: filenApiKey
        || filenEmail
        || filenAuthStatePath
        ? {
            apiKey: filenApiKey,
            email: filenEmail,
            password: filenPassword,
            twoFactorCode: filenTwoFactorCode,
            baseUrl: filenBaseUrl,
            targetFolder: filenTargetFolder,
            authStatePath: filenAuthStatePath,
          }
        : undefined,
    },
    backupPolicy: {
      maxBackupsInFilenDrive,
      daysBetweenBackups,
      backupTimeOfDay,
      deleteAfterUpload,
      backupNameTemplate,
      generationalDays,
      generationalWeeks,
      sendErrorReports,
      excludeFolders,
      excludeAddons,
    },
  };
}

function parseBoolean(value: unknown, fallback = false): boolean {
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

function parseInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseCsv(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readConfigFile(configPath: string): RawConfig {
  const absolutePath = resolve(configPath);

  if (!existsSync(absolutePath)) {
    return {};
  }

  const raw = readFileSync(absolutePath, "utf8");
  return JSON.parse(raw) as RawConfig;
}
