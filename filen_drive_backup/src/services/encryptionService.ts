import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const MAGIC = Buffer.from("HAFB1");
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class EncryptionService {
  encryptFile(inputPath: string, outputPath: string, passphrase: string): string {
    const plaintext = readFileSync(inputPath);
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = scryptSync(passphrase, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([MAGIC, salt, iv, authTag, ciphertext]);

    writeFileSync(outputPath, payload);

    return outputPath;
  }

  decryptFile(inputPath: string, outputPath: string, passphrase: string): string {
    const payload = readFileSync(inputPath);
    const magic = payload.subarray(0, MAGIC.length);

    if (!magic.equals(MAGIC)) {
      throw new Error("Ungueltiges Dateiformat fuer verschluesseltes Backup.");
    }

    const saltStart = MAGIC.length;
    const ivStart = saltStart + SALT_LENGTH;
    const tagStart = ivStart + IV_LENGTH;
    const dataStart = tagStart + AUTH_TAG_LENGTH;

    const salt = payload.subarray(saltStart, ivStart);
    const iv = payload.subarray(ivStart, tagStart);
    const authTag = payload.subarray(tagStart, dataStart);
    const ciphertext = payload.subarray(dataStart);
    const key = scryptSync(passphrase, salt, 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);

    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    writeFileSync(outputPath, plaintext);

    return outputPath;
  }
}
