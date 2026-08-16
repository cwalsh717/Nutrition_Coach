-- Diary entries move from belonging to a Week to belonging to the User.
-- A plan is just a plan: tracking must work every day, whether or not a week
-- has been planned, and re-dating a plan must never orphan what you ate.
--
-- Data-preserving: userId is backfilled from each entry's owning week before
-- weekId is dropped. If any row failed to backfill, the NOT NULL below aborts
-- the whole migration rather than losing an entry.

ALTER TABLE "FoodLogEntry" ADD COLUMN "userId" TEXT;

UPDATE "FoodLogEntry" AS f
SET "userId" = w."userId"
FROM "Week" AS w
WHERE f."weekId" = w."id";

ALTER TABLE "FoodLogEntry" ALTER COLUMN "userId" SET NOT NULL;

DROP INDEX "FoodLogEntry_weekId_date_idx";
ALTER TABLE "FoodLogEntry" DROP CONSTRAINT "FoodLogEntry_weekId_fkey";
ALTER TABLE "FoodLogEntry" DROP COLUMN "weekId";

CREATE INDEX "FoodLogEntry_userId_date_idx" ON "FoodLogEntry"("userId", "date");
ALTER TABLE "FoodLogEntry"
  ADD CONSTRAINT "FoodLogEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
