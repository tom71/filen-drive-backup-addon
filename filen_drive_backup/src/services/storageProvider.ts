export interface UploadMetadata {
  createdAt: string;
  sourceDirectory: string;
}

export interface UploadResult {
  location: string;
  bytesStored: number;
}

export interface DownloadResult {
  location: string;
  localPath: string;
}

export interface StorageProvider {
  uploadFile(filePath: string, targetName: string, metadata: UploadMetadata): Promise<UploadResult>;
  downloadFile(sourceLocation: string, destinationPath: string): Promise<DownloadResult>;
}
