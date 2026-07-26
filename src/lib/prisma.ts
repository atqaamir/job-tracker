import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decrypt, encrypt, isEncrypted } from "@/lib/crypto";

const ENCRYPTED_ACCOUNT_FIELDS = ["access_token", "refresh_token", "id_token"] as const;

// The Account model's writable columns. OAuth providers (e.g. Google's
// `refresh_token_expires_in`) sometimes include extra fields in their token
// response beyond the OAuth spec; next-auth forwards the whole object to the
// adapter, so anything not in this set must be dropped before it reaches
// Prisma or `account.create`/`update` throws PrismaClientValidationError.
const ACCOUNT_FIELDS = new Set([
  "id",
  "userId",
  "type",
  "provider",
  "providerAccountId",
  "refresh_token",
  "access_token",
  "expires_at",
  "token_type",
  "scope",
  "id_token",
  "session_state",
]);

type AccountRecord = Record<string, unknown> | null | undefined;

function stripUnknownAccountFields(data: AccountRecord): void {
  if (!data) return;
  for (const key of Object.keys(data)) {
    if (!ACCOUNT_FIELDS.has(key)) delete data[key];
  }
}

function encryptAccountFields(data: AccountRecord): void {
  if (!data) return;
  for (const field of ENCRYPTED_ACCOUNT_FIELDS) {
    const value = data[field];
    if (typeof value === "string" && value.length > 0) {
      data[field] = encrypt(value);
    }
  }
}

function decryptAccountFields<T extends AccountRecord>(data: T): T {
  if (!data) return data;
  for (const field of ENCRYPTED_ACCOUNT_FIELDS) {
    const value = data[field];
    if (isEncrypted(value)) {
      data[field] = decrypt(value);
    }
  }
  return data;
}

/**
 * OAuth access/refresh tokens are sensitive — encrypt them at the
 * application layer (AES-256-GCM, see src/lib/crypto.ts) before they reach
 * the database, on top of Supabase's infrastructure-level encryption at
 * rest. Transparent to every caller, including @auth/prisma-adapter and
 * src/lib/gmail.ts, since both read/write through this same client.
 */
function withTokenEncryption(client: PrismaClient) {
  return client.$extends({
    name: "token-encryption",
    query: {
      account: {
        create({ args, query }) {
          stripUnknownAccountFields(args.data as AccountRecord);
          encryptAccountFields(args.data as AccountRecord);
          return query(args);
        },
        update({ args, query }) {
          stripUnknownAccountFields(args.data as AccountRecord);
          encryptAccountFields(args.data as AccountRecord);
          return query(args);
        },
        upsert({ args, query }) {
          stripUnknownAccountFields(args.create as AccountRecord);
          stripUnknownAccountFields(args.update as AccountRecord);
          encryptAccountFields(args.create as AccountRecord);
          encryptAccountFields(args.update as AccountRecord);
          return query(args);
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          return decryptAccountFields(result as AccountRecord);
        },
        async findFirst({ args, query }) {
          const result = await query(args);
          return decryptAccountFields(result as AccountRecord);
        },
        async findMany({ args, query }) {
          const results = await query(args);
          return (results as AccountRecord[]).map((r) => decryptAccountFields(r));
        },
      },
    },
  });
}

declare global {
  var __prisma: ReturnType<typeof createPrismaClient> | undefined;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return withTokenEncryption(new PrismaClient({ adapter }));
}

export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
