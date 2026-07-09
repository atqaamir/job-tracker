import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncrypted } from "@/lib/crypto";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-only-encryption-key-do-not-use-in-prod";
});

describe("encrypt/decrypt", () => {
  it("round-trips a plaintext string", () => {
    const plaintext = "ya29.a0AfH6SMB-example-refresh-token";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const plaintext = "same-input";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("rejects a tampered ciphertext", () => {
    const ciphertext = encrypt("secret-value");
    const [iv, tag, data] = ciphertext.split(":");
    const tampered = `${iv}:${tag}:${data.slice(0, -4)}AAAA`;
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("isEncrypted", () => {
  it("recognizes a value produced by encrypt()", () => {
    expect(isEncrypted(encrypt("hello"))).toBe(true);
  });

  it("rejects plain OAuth-token-shaped strings", () => {
    expect(isEncrypted("ya29.a0AfH6SMB-plain-access-token")).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});
