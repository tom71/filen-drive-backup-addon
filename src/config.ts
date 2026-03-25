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
    local?: {
      baseDirectory?: string;
    };
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
  local_storage_directory?: string;
  filen_api_key?: string;
  filen_email?: string;
  filen_password?: string;
  filen_2fa_code?: string;
  filen_base_url?: string;
  filen_target_folder?: string;
  filen_auth_state_path?: string;
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
    "local";
  const localBaseDirectory =
    process.env.LOCAL_STORAGE_DIRECTORY ??
    fileConfig.storage?.local?.baseDirectory ??
    fileConfig.local_storage_directory;
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

  if (!passphrase) {
    throw new Error("encryption.passphrase fehlt in der Konfiguration.");
  }

  if (storageType === "local" && !localBaseDirectory) {
    throw new Error("storage.local.baseDirectory fehlt fuer den lokalen Storage-Provider.");
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
      local: localBaseDirectory
        ? {
            baseDirectory: resolve(localBaseDirectory),
          }
        : undefined,
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
  };
}

function readConfigFile(configPath: string): RawConfig {
  const absolutePath = resolve(configPath);

  if (!existsSync(absolutePath)) {
    return {};
  }

  const raw = readFileSync(absolutePath, "utf8");
  return JSON.parse(raw) as RawConfig;
}
