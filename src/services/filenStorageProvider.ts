import { dirname, posix } from "node:path";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { FilenAuthState, FilenStorageConfig } from "../types/config";
import { DownloadResult, StorageProvider, UploadMetadata, UploadResult } from "./storageProvider";

export class FilenStorageProvider implements StorageProvider {
  constructor(private readonly config: FilenStorageConfig) {}

  async initializeAuthState(): Promise<{ authStatePath: string; userId: number }> {
    const { sdk, cleanup } = await this.createAuthenticatedSdk({
      allowStoredState: false,
      requireInteractiveLogin: true,
    });

    try {
      const state = extractAuthState(sdk.config);
      this.persistAuthState(state);

      return {
        authStatePath: this.resolveAuthStatePath(),
        userId: state.userId,
      };
    } finally {
      await cleanup();
    }
  }

  async uploadFile(filePath: string, targetName: string, _metadata: UploadMetadata): Promise<UploadResult> {
    const { sdk, cleanup } = await this.createAuthenticatedSdk({});
    const targetFolder = normalizeTargetFolder(this.config.targetFolder);
    const destinationPath = posix.join(targetFolder, targetName);

    try {
      await sdk.fs().upload({
        path: destinationPath,
        source: filePath,
      });

      return {
        location: `filen:${destinationPath}`,
        bytesStored: (await sdk.fs().stat({ path: destinationPath })).size,
      };
    } finally {
      await cleanup();
    }
  }

  async downloadFile(sourceLocation: string, destinationPath: string): Promise<DownloadResult> {
    const { sdk, cleanup } = await this.createAuthenticatedSdk({});
    const remotePath = normalizeRemoteFilePath(sourceLocation, this.config.targetFolder);

    try {
      mkdirSync(dirname(destinationPath), { recursive: true });

      await sdk.fs().download({
        path: remotePath,
        destination: destinationPath,
      });

      return {
        location: `filen:${remotePath}`,
        localPath: destinationPath,
      };
    } finally {
      await cleanup();
    }
  }

  private async createAuthenticatedSdk({
    allowStoredState = true,
    requireInteractiveLogin = false,
  }: {
    allowStoredState?: boolean;
    requireInteractiveLogin?: boolean;
  }): Promise<{ sdk: InstanceType<typeof import("@filen/sdk").FilenSDK>; cleanup: () => Promise<void> }> {
    const { FilenSDK } = await import("@filen/sdk");

    if (allowStoredState) {
      const storedState = this.tryLoadAuthState();

      if (storedState) {
        const sdkFromState = new FilenSDK({
          ...storedState,
          metadataCache: true,
          connectToSocket: false,
          tmpPath: "/tmp/filen-sdk",
        });

        if (await this.isSdkSessionUsable(sdkFromState)) {
          return {
            sdk: sdkFromState,
            cleanup: async () => {
              try {
                await sdkFromState.clearTemporaryDirectory();
              } catch {
                // Best effort cleanup only.
              }

              sdkFromState.logout();
            },
          };
        }

        sdkFromState.logout();
      }
    }

    if (!this.config.email || !this.config.password) {
      throw new Error(
        "Kein gueltiger gespeicherter Filen-Auth-State gefunden und keine Login-Daten vorhanden. Fuehre zuerst den Befehl 'setup-filen-auth' mit filen_email, filen_password und aktuellem 2FA-Code aus.",
      );
    }

    if (requireInteractiveLogin && !this.config.twoFactorCode) {
      throw new Error("setup-filen-auth erfordert einen aktuellen filen_2fa_code, wenn 2FA aktiviert ist.");
    }

    const sdk = new FilenSDK({
      metadataCache: true,
      connectToSocket: false,
      tmpPath: "/tmp/filen-sdk",
    });

    await sdk.login({
      email: this.config.email,
      password: this.config.password,
      twoFactorCode: this.config.twoFactorCode || "XXXXXX",
    });

    const state = extractAuthState(sdk.config);
    this.persistAuthState(state);

    return {
      sdk,
      cleanup: async () => {
        try {
          await sdk.clearTemporaryDirectory();
        } catch {
          // Best effort cleanup only.
        }

        sdk.logout();
      },
    };
  }

  private tryLoadAuthState(): FilenAuthState | null {
    const path = this.resolveAuthStatePath();

    if (!existsSync(path)) {
      return null;
    }

    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FilenAuthState>;

      if (!isValidAuthState(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private persistAuthState(state: FilenAuthState): void {
    const path = this.resolveAuthStatePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8" });

    try {
      chmodSync(path, 0o600);
    } catch {
      // Permission hardening is best effort.
    }
  }

  private resolveAuthStatePath(): string {
    return this.config.authStatePath || "/addon_configs/filen_drive_backup/filen-auth-state.json";
  }

  private async isSdkSessionUsable(sdk: InstanceType<typeof import("@filen/sdk").FilenSDK>): Promise<boolean> {
    try {
      return await sdk.user().checkAPIKeyValidity();
    } catch {
      return false;
    }
  }
}

function normalizeTargetFolder(targetFolder?: string): string {
  if (!targetFolder || targetFolder.trim().length === 0) {
    return "/Home Assistant Backups";
  }

  const normalized = targetFolder.startsWith("/") ? targetFolder : `/${targetFolder}`;
  return normalized.replace(/\/+$/g, "") || "/";
}

function normalizeRemoteFilePath(sourceLocation: string, configuredTargetFolder?: string): string {
  const trimmed = sourceLocation.trim();

  if (trimmed.startsWith("filen:")) {
    const remotePath = trimmed.slice("filen:".length);
    return remotePath.startsWith("/") ? remotePath : `/${remotePath}`;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return posix.join(normalizeTargetFolder(configuredTargetFolder), trimmed);
}

function extractAuthState(config: {
  apiKey?: string;
  masterKeys?: string[];
  publicKey?: string;
  privateKey?: string;
  baseFolderUUID?: string;
  authVersion?: number;
  userId?: number;
}): FilenAuthState {
  if (!config.apiKey || !config.masterKeys || !config.publicKey || !config.privateKey || !config.baseFolderUUID) {
    throw new Error("Filen SDK lieferte keinen vollstaendigen Auth-State nach dem Login.");
  }

  if (![1, 2, 3].includes(config.authVersion ?? 0)) {
    throw new Error("Filen SDK lieferte eine ungueltige authVersion.");
  }

  if (!config.userId || config.userId <= 0) {
    throw new Error("Filen SDK lieferte keine gueltige userId.");
  }

  return {
    apiKey: config.apiKey,
    masterKeys: config.masterKeys,
    publicKey: config.publicKey,
    privateKey: config.privateKey,
    baseFolderUUID: config.baseFolderUUID,
    authVersion: config.authVersion as 1 | 2 | 3,
    userId: config.userId,
    persistedAt: new Date().toISOString(),
  };
}

function isValidAuthState(state: Partial<FilenAuthState>): state is FilenAuthState {
  return Boolean(
    state.apiKey &&
      state.masterKeys &&
      state.masterKeys.length > 0 &&
      state.publicKey &&
      state.privateKey &&
      state.baseFolderUUID &&
      state.userId &&
      state.userId > 0 &&
      state.authVersion &&
      [1, 2, 3].includes(state.authVersion),
  );
}

