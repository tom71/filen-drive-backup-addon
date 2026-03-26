import { loadConfig } from "./config";
import { BackupService } from "./services/backupService";
import { FilenStorageProvider } from "./services/filenStorageProvider";
import { RestoreService } from "./services/restoreService";
import { startUiServer } from "./web/uiServer";

async function main(): Promise<void> {
  const command = process.argv[2] ?? "backup";

  switch (command) {
    case "backup": {
      const config = loadConfig();
      const backupService = new BackupService(config);
      const result = await backupService.runBackup();

      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      break;
    }
    case "restore": {
      const config = loadConfig();
      const backupLocation = process.argv[3] ?? process.env.BACKUP_LOCATION;
      const restoreDirectory = process.argv[4] ?? process.env.RESTORE_DIRECTORY;

      if (!backupLocation) {
        throw new Error("Kein Backup-Pfad angegeben. Nutzung: restore <backupLocation> [restoreDirectory]");
      }

      const restoreService = new RestoreService(config);
      const result = await restoreService.runRestore(backupLocation, restoreDirectory);

      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      break;
    }
    case "setup-filen-auth": {
      const config = loadConfig();

      if (config.storage.type !== "filen" || !config.storage.filen) {
        throw new Error("setup-filen-auth kann nur mit storage_provider=filen verwendet werden.");
      }

      const provider = new FilenStorageProvider(config.storage.filen);
      const result = await provider.initializeAuthState();

      process.stdout.write(`${JSON.stringify({
        message: "Filen Auth-State erfolgreich gespeichert.",
        ...result,
      }, null, 2)}\n`);
      break;
    }
    case "ui": {
      const portArg = Number(process.argv[3]);
      const port = Number.isFinite(portArg) && portArg > 0 ? portArg : Number(process.env.UI_PORT ?? 8099);

      await startUiServer(port);
      break;
    }
    default:
      throw new Error(`Unbekannter Befehl: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unbekannter Fehler";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});