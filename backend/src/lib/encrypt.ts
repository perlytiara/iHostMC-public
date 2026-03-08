import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const raw = config.encryptionKey;
  if (!raw || raw.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 characters");
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return scryptSync(raw.slice(0, 64), "ihostmc-salt", KEY_LENGTH);
}

/**
 * Encrypt a plaintext string. Returns "iv:tag:base64 ciphertext" for storage.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/**
 * Decrypt a value produced by encrypt().
 */
export function decrypt(encoded: string): string {
  const key = getKey();
  const parts = encoded.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted payload");
  const [ivB, tagB, encB] = parts;
  const iv = Buffer.from(ivB!, "base64");
  const tag = Buffer.from(tagB!, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(Buffer.from(encB!, "base64")) + decipher.final("utf8");
}
