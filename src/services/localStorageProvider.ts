import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { LocalStorageConfig } from "../types/config";
import { DownloadResult, StorageProvider, UploadMetadata, UploadResult } from "./storageProvider";

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly config: LocalStorageConfig) {}

  async uploadFile(filePath: string, targetName: string, _metadata: UploadMetadata): Promise<UploadResult> {
    if (!existsSync(this.config.baseDirectory)) {
      mkdirSync(this.config.baseDirectory, { recursive: true });
    }

    const destinationPath = join(this.config.baseDirectory, targetName);
    copyFileSync(filePath, destinationPath);

    return {
      location: destinationPath,
      bytesStored: statSync(destinationPath).size,
    };
  }

  async downloadFile(sourceLocation: string, destinationPath: string): Promise<DownloadResult> {
    const resolvedSource = isAbsolute(sourceLocation)
      ? sourceLocation
      : join(this.config.baseDirectory, sourceLocation);

    if (!existsSync(resolvedSource)) {
      throw new Error(`Lokales Backup nicht gefunden: ${resolvedSource}`);
    }

    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(resolvedSource, destinationPath);

    return {
      location: resolvedSource,
      localPath: destinationPath,
    };
  }
}
