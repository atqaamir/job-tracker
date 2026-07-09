import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add it to your environment variables."
    );
  }
  // Derive a fixed-length 32-byte key from a secret of any length/format.
  cachedKey = crypto.createHash("sha256").update(secret).digest();
  return cachedKey;
}

const PAYLOAD_PATTERN = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;

/**
 * Encrypts a string with AES-256-GCM. Returns `iv:authTag:ciphertext`,
 * all base64-encoded. Used for OAuth tokens stored at rest (see
 * withTokenEncryption in src/lib/prisma.ts).
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
}

/** True for strings that look like they were produced by `encrypt()`. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && PAYLOAD_PATTERN.test(value);
}
