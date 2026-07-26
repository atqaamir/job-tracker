-- Default sync lookback window changed from 365 days to 14 days for new users.
ALTER TABLE "SyncSettings" ALTER COLUMN "daysToLookBack" SET DEFAULT 14;
