import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("HAFB1");
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;

export class EncryptionService {
  async encryptFile(inputPath: string, outputPath: string, passphrase: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = scryptSync(passphrase, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const header = Buffer.concat([MAGIC, salt, iv, Buffer.alloc(AUTH_TAG_LENGTH)]);
    const file = await open(outputPath, "w");

    try {
      await file.write(header, 0, header.length, 0);

      await pipeline(
        createReadStream(inputPath),
        cipher,
        createWriteStream(outputPath, { flags: "r+", start: HEADER_LENGTH }),
      );

      const authTag = cipher.getAuthTag();
      const authTagOffset = MAGIC.length + SALT_LENGTH + IV_LENGTH;
      await file.write(authTag, 0, AUTH_TAG_LENGTH, authTagOffset);
    } finally {
      await file.close();
    }

    return outputPath;
  }

  async decryptFile(inputPath: string, outputPath: string, passphrase: string): Promise<string> {
    const file = await open(inputPath, "r");
    const header = Buffer.alloc(HEADER_LENGTH);

    try {
      const { bytesRead } = await file.read(header, 0, HEADER_LENGTH, 0);

      if (bytesRead < HEADER_LENGTH) {
        throw new Error("Ungueltiges Dateiformat fuer verschluesseltes Backup.");
      }
    } finally {
      await file.close();
    }

    const magic = header.subarray(0, MAGIC.length);

    if (!magic.equals(MAGIC)) {
      throw new Error("Ungueltiges Dateiformat fuer verschluesseltes Backup.");
    }

    const saltStart = MAGIC.length;
    const ivStart = saltStart + SALT_LENGTH;
    const tagStart = ivStart + IV_LENGTH;
    const dataStart = tagStart + AUTH_TAG_LENGTH;

    const salt = header.subarray(saltStart, ivStart);
    const iv = header.subarray(ivStart, tagStart);
    const authTag = header.subarray(tagStart, dataStart);
    const key = scryptSync(passphrase, salt, 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);

    decipher.setAuthTag(authTag);

    await pipeline(
      createReadStream(inputPath, { start: HEADER_LENGTH }),
      decipher,
      createWriteStream(outputPath),
    );

    return outputPath;
  }
}
