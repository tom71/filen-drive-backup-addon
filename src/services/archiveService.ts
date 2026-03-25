import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export class ArchiveService {
  async createTarGz(sourceDirectory: string, outputDirectory: string, baseName: string): Promise<string> {
    if (!existsSync(sourceDirectory)) {
      throw new Error(`Quellverzeichnis existiert nicht: ${sourceDirectory}`);
    }

    mkdirSync(outputDirectory, { recursive: true });

    const archivePath = join(outputDirectory, `${baseName}.tar.gz`);

    await execFileAsync("tar", ["-czf", archivePath, "-C", dirname(sourceDirectory), basename(sourceDirectory)]);

    return archivePath;
  }

  async extractTarGz(archivePath: string, outputDirectory: string): Promise<string> {
    if (!existsSync(archivePath)) {
      throw new Error(`Archiv existiert nicht: ${archivePath}`);
    }

    mkdirSync(outputDirectory, { recursive: true });

    await execFileAsync("tar", ["-xzf", archivePath, "-C", outputDirectory]);

    return outputDirectory;
  }
}
