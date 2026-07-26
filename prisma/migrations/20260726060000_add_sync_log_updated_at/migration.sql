-- Lets /api/sync/status detect a "running" SyncLog whose job actually died
-- (crash, dev-server restart, serverless timeout) without ever reaching a
-- terminal status, by checking how long it's been since the last progress
-- update.
ALTER TABLE "SyncLog" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
