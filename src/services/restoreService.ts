import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import { AppConfig, RestoreResult } from "../types/config";
import { ArchiveService } from "./archiveService";
import { EncryptionService } from "./encryptionService";
import { FilenStorageProvider } from "./filenStorageProvider";
import { StorageProvider } from "./storageProvider";

export class RestoreService {
  private readonly archiveService = new ArchiveService();
  private readonly encryptionService = new EncryptionService();

  constructor(private readonly config: AppConfig) {}

  async runRestore(
    backupLocation: string,
    restoreDirectory?: string,
    selectedEntries?: string[],
  ): Promise<RestoreResult> {
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
      const archiveEntries = await this.archiveService.listTarGzEntries(decryptedPath);
      const resolvedSelectedEntries = resolveSelectedArchiveEntries(archiveEntries, selectedEntries);

      await this.archiveService.extractTarGz(decryptedPath, effectiveRestoreDirectory, resolvedSelectedEntries);

      return {
        backupLocation,
        downloadedArchivePath: downloadedPath,
        decryptedArchivePath: decryptedPath,
        restoredTo: effectiveRestoreDirectory,
        restoredEntryCount: resolvedSelectedEntries?.length,
        selectedEntries: summarizeSelectedRoots(resolvedSelectedEntries),
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
    selectableEntries: string[];
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
        selectableEntries: summarizeTopLevelEntries(entries),
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

  async placeBackupInDirectory(
    backupLocation: string,
    destinationDirectory = "/backup",
  ): Promise<{
    backupLocation: string;
    placedPath: string;
    placedFileName: string;
    placedAt: string;
  }> {
    mkdirSync(this.config.workingDirectory, { recursive: true });
    mkdirSync(destinationDirectory, { recursive: true });

    const { downloadedPath, decryptedPath } = this.createTempPaths();
    const storageProvider = this.createStorageProvider();

    try {
      await storageProvider.downloadFile(backupLocation, downloadedPath);
      await this.encryptionService.decryptFile(downloadedPath, decryptedPath, this.config.encryption.passphrase);

      const placedFileName = buildPlacedBackupName(backupLocation);
      const placedPath = ensureUniquePath(destinationDirectory, placedFileName);
      moveFileCrossDeviceSafe(decryptedPath, placedPath);

      return {
        backupLocation,
        placedPath,
        placedFileName: basename(placedPath),
        placedAt: new Date().toISOString(),
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

function resolveSelectedArchiveEntries(archiveEntries: string[], selectedEntries?: string[]): string[] | undefined {
  if (!Array.isArray(selectedEntries) || selectedEntries.length === 0) {
    return undefined;
  }

  const normalizedSelections = selectedEntries
    .map((entry) => normalizeArchiveEntry(entry))
    .filter((entry, index, array) => entry.length > 0 && array.indexOf(entry) === index);

  if (normalizedSelections.length === 0) {
    return undefined;
  }

  const resolved = archiveEntries.filter((entry) => {
    const normalizedEntry = normalizeArchiveEntry(entry);

    return normalizedSelections.some(
      (selection) => normalizedEntry === selection || normalizedEntry.startsWith(`${selection}/`),
    );
  });

  if (resolved.length === 0) {
    throw new Error("Keine gueltigen Archivpfade fuer das selektive Restore gefunden.");
  }

  return resolved;
}

function summarizeTopLevelEntries(entries: string[]): string[] {
  const seen = new Set<string>();

  for (const entry of entries) {
    const normalized = normalizeArchiveEntry(entry);
    const topLevel = normalized.split("/")[0]?.trim();

    if (topLevel) {
      seen.add(topLevel);
    }
  }

  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function summarizeSelectedRoots(entries: string[] | undefined): string[] | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  return summarizeTopLevelEntries(entries);
}

function normalizeArchiveEntry(entry: string): string {
  return entry.replace(/^\.\//, "").replace(/\/+$|\s+$/g, "").trim();
}

function buildPlacedBackupName(backupLocation: string): string {
  const raw = backupLocation.startsWith("filen:") ? backupLocation.slice("filen:".length) : backupLocation;
  const fileName = basename(raw.trim()) || `filen-backup-${Date.now()}.enc`;

  if (fileName.endsWith(".enc")) {
    return fileName.slice(0, -4);
  }

  return fileName;
}

function ensureUniquePath(directory: string, fileName: string): string {
  let candidate = join(directory, fileName);

  if (!existsSync(candidate)) {
    return candidate;
  }

  const suffix = new Date().toISOString().replace(/[:.]/g, "-");
  return join(directory, `${fileName}.${suffix}`);
}

function moveFileCrossDeviceSafe(sourcePath: string, destinationPath: string): void {
  // In Add-on deployments /tmp and /backup are often different filesystems.
  // Copy + remove avoids EXDEV errors from cross-device rename operations.
  copyFileSync(sourcePath, destinationPath);
  rmSync(sourcePath, { force: true });
}
