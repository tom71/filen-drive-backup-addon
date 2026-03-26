import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { AppConfig, BackupResult } from "../types/config";
import { ArchiveService } from "./archiveService";
import { EncryptionService } from "./encryptionService";
import { FilenStorageProvider } from "./filenStorageProvider";
import { LocalStorageProvider } from "./localStorageProvider";
import { StorageProvider } from "./storageProvider";

export class BackupService {
  private readonly archiveService = new ArchiveService();
  private readonly encryptionService = new EncryptionService();

  constructor(private readonly config: AppConfig) {}

  async runBackup(): Promise<BackupResult> {
    if (!this.config.sourceDirectory) {
      throw new Error("sourceDirectory fehlt in der Konfiguration.");
    }

    if (!existsSync(this.config.sourceDirectory)) {
      throw new Error(`Quellverzeichnis existiert nicht: ${this.config.sourceDirectory}`);
    }

    mkdirSync(this.config.workingDirectory, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `home-assistant-backup-${timestamp}`;
    const archivePath = await this.archiveService.createTarGz(
      this.config.sourceDirectory,
      this.config.workingDirectory,
      baseName,
    );
    const encryptedPath = join(this.config.workingDirectory, `${baseName}.tar.gz.enc`);

    try {
      this.encryptionService.encryptFile(
        archivePath,
        encryptedPath,
        this.config.encryption.passphrase,
      );

      const storageProvider = this.createStorageProvider();
      const uploadResult = await storageProvider.uploadFile(encryptedPath, `${baseName}.tar.gz.enc`, {
        createdAt: new Date().toISOString(),
        sourceDirectory: this.config.sourceDirectory,
      });

      return {
        archiveName: `${baseName}.tar.gz.enc`,
        localArchivePath: archivePath,
        encryptedArchivePath: encryptedPath,
        uploadedTo: uploadResult.location,
        sizeBytes: statSync(encryptedPath).size,
        createdAt: new Date().toISOString(),
      };
    } finally {
      rmSync(archivePath, { force: true });
      rmSync(encryptedPath, { force: true });
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
