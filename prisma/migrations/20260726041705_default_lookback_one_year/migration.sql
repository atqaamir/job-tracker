-- "Fetch All Again" default lookback window changed from 14 days to 365
-- days (1 year) for new users, now that Sync Now handles the regular
-- incremental case and Fetch All Again is the dedicated deep-resync action.
ALTER TABLE "SyncSettings" ALTER COLUMN "daysToLookBack" SET DEFAULT 365;
