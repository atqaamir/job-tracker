-- Per-user AI classification config: enable/disable AI mode, model choice,
-- and an optional per-user Anthropic API key (encrypted at the app layer,
-- same as OAuth tokens) that overrides the server's ANTHROPIC_API_KEY.
ALTER TABLE "SyncSettings" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SyncSettings" ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5';
ALTER TABLE "SyncSettings" ADD COLUMN "anthropicApiKey" TEXT;
