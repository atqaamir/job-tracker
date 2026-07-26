-- Lets a running sync be cancelled mid-way: POST /api/sync/cancel sets this
-- flag, and the sync loop polls it between messages.
ALTER TABLE "SyncLog" ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
