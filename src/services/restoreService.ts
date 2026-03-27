import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { AppConfig, RestoreResult } from "../types/config";
import { ArchiveService } from "./archiveService";
import { EncryptionService } from "./encryptionService";
import { FilenStorageProvider } from "./filenStorageProvider";
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

    const { downloadedPath, decryptedPath } = this.createTempPaths();
    const storageProvider = this.createStorageProvider();

    try {
      await storageProvider.downloadFile(backupLocation, downloadedPath);
      await this.encryptionService.decryptFile(downloadedPath, decryptedPath, this.config.encryption.passphrase);
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

  async previewRestore(backupLocation: string, maxEntries = 120): Promise<{
    backupLocation: string;
    totalEntries: number;
    entriesPreview: string[];
    topLevelEntries: string[];
  }> {
    const { downloadedPath, decryptedPath } = this.createTempPaths();
    const storageProvider = this.createStorageProvider();

    try {
      await storageProvider.downloadFile(backupLocation, downloadedPath);
      await this.encryptionService.decryptFile(downloadedPath, decryptedPath, this.config.encryption.passphrase);
      const entries = await this.archiveService.listTarGzEntries(decryptedPath);

      return {
        backupLocation,
        totalEntries: entries.length,
        entriesPreview: entries.slice(0, Math.max(1, maxEntries)),
        topLevelEntries: summarizeTopLevelEntries(entries),
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
    if (!this.config.storage.filen) {
      throw new Error("Filen-Konfiguration fehlt.");
    }

    return new FilenStorageProvider(this.config.storage.filen);
  }

  private createTempPaths(): { downloadedPath: string; decryptedPath: string } {
    const restoreId = new Date().toISOString().replace(/[:.]/g, "-");

    return {
      downloadedPath: join(this.config.workingDirectory, `restore-${restoreId}.tar.gz.enc`),
      decryptedPath: join(this.config.workingDirectory, `restore-${restoreId}.tar.gz`),
    };
  }
}

function summarizeTopLevelEntries(entries: string[]): string[] {
  const seen = new Set<string>();

  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//, "");
    const topLevel = normalized.split("/")[0]?.trim();

    if (topLevel) {
      seen.add(topLevel);
    }
  }

  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}