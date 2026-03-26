import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { AppConfig, RestoreResult } from "../types/config";
import { ArchiveService } from "./archiveService";
import { EncryptionService } from "./encryptionService";
import { FilenStorageProvider } from "./filenStorageProvider";
import { LocalStorageProvider } from "./localStorageProvider";
import { StorageProvider } from "./storageProvider";

export class RestoreService {
  private readonly archiveService = new ArchiveService();
  private readonly encryptionService = new EncryptionService();

  constructor(private readonly config: AppConfig) {}

  async runRestore(backupLocation: string, restoreDirectory?: string): Promise<RestoreResult> {
    const effectiveRestoreDirectory = restoreDirectory ?? this.config.restoreDirectory;

    if (!effectiveRestoreDirectory) {
      throw new Error("Kein Restore-Ziel angegeben. Uebergib ein Zielverzeichnis oder setze restoreDirectory in der Konfiguration.");
    }

    mkdirSync(this.config.workingDirectory, { recursive: true });
    mkdirSync(effectiveRestoreDirectory, { recursive: true });

    const restoreId = new Date().toISOString().replace(/[:.]/g, "-");
    const downloadedPath = join(this.config.workingDirectory, `restore-${restoreId}.tar.gz.enc`);
    const decryptedPath = join(this.config.workingDirectory, `restore-${restoreId}.tar.gz`);
    const storageProvider = this.createStorageProvider();

    try {
      await storageProvider.downloadFile(backupLocation, downloadedPath);
      this.encryptionService.decryptFile(downloadedPath, decryptedPath, this.config.encryption.passphrase);
      await this.archiveService.extractTarGz(decryptedPath, effectiveRestoreDirectory);

      return {
        backupLocation,
        downloadedArchivePath: downloadedPath,
        decryptedArchivePath: decryptedPath,
        restoredTo: effectiveRestoreDirectory,
        restoredAt: new Date().toISOString(),
      };
    } finally {
      if (existsSync(downloadedPath)) {
        rmSync(downloadedPath, { force: true });
      }

      if (existsSync(decryptedPath)) {
        rmSync(decryptedPath, { force: true });
      }
    }
  }

  private createStorageProvider(): StorageProvider {
    if (this.config.storage.type === "filen") {
      if (!this.config.storage.filen) {
        throw new Error("Filen-Konfiguration fehlt.");
      }

      return new FilenStorageProvider(this.config.storage.filen);
    }

    if (!this.config.storage.local) {
      throw new Error("Lokale Storage-Konfiguration fehlt.");
    }

    return new LocalStorageProvider(this.config.storage.local);
  }
}