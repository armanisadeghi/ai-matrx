import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export interface StoredGoogleCredential {
  refreshToken: string;
  scopes: string[];
}

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
  tag: string;
}

function encryptionKey(): Buffer {
  const material =
    process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!material) {
    throw new Error("Google OAuth credential encryption is not configured.");
  }
  return createHash("sha256")
    .update(`ai-matrx:marketing-google-oauth:v1:${material}`)
    .digest();
}

export function encryptCredential(
  value: StoredGoogleCredential,
): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredential(
  value: EncryptedCredential,
): StoredGoogleCredential {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as StoredGoogleCredential;
}
