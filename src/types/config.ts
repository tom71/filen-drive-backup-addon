export type StorageProviderType = "local" | "filen";

export interface EncryptionConfig {
  passphrase: string;
}

export interface LocalStorageConfig {
  baseDirectory: string;
}

export interface FilenStorageConfig {
  apiKey?: string;
  email?: string;
  password?: string;
  twoFactorCode?: string;
  baseUrl?: string;
  targetFolder?: string;
  authStatePath?: string;
}

export interface FilenAuthState {
  apiKey: string;
  masterKeys: string[];
  publicKey: string;
  privateKey: string;
  baseFolderUUID: string;
  authVersion: 1 | 2 | 3;
  userId: number;
  persistedAt: string;
}

export interface StorageConfig {
  type: StorageProviderType;
  local?: LocalStorageConfig;
  filen?: FilenStorageConfig;
}

export interface AppConfig {
  sourceDirectory?: string;
  workingDirectory: string;
  restoreDirectory?: string;
  encryption: EncryptionConfig;
  storage: StorageConfig;
}

export interface BackupResult {
  archiveName: string;
  localArchivePath: string;
  encryptedArchivePath: string;
  uploadedTo: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RestoreResult {
  backupLocation: string;
  downloadedArchivePath: string;
  decryptedArchivePath: string;
  restoredTo: string;
  restoredAt: string;
}
