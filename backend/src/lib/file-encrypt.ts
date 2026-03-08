import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const raw = config.encryptionKey;
  if (!raw || raw.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 characters");
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return scryptSync(raw.slice(0, 64), "ihostmc-file-salt", KEY_LENGTH);
}

export interface EncryptedFile {
  iv: string;
  tag: string;
  data: Buffer;
}

export function encryptBuffer(plaintext: Buffer): EncryptedFile {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data,
  };
}

export function decryptBuffer(encrypted: Buffer, ivB64: string, tagB64: string): Buffer {
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function canEncrypt(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
