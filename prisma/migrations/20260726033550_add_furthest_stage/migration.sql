-- Tracks the most advanced stage an application ever reached, independent
-- of its current status, so a rejection after an interview is distinguishable
-- from a direct rejection.
ALTER TABLE "JobApplication" ADD COLUMN "furthestStage" "ApplicationStatus";
