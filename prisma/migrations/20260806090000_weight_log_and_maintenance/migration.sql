-- Weigh-ins, and the two Profile knobs the deficit math needs.
-- Additive only: no existing column changes, no data touched.

ALTER TABLE "Profile" ADD COLUMN "maintenanceKcal" INTEGER;
ALTER TABLE "Profile" ADD COLUMN "bankToleranceKcal" INTEGER NOT NULL DEFAULT 500;

CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weightLb" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WeightEntry_userId_date_idx" ON "WeightEntry"("userId", "date");
CREATE UNIQUE INDEX "WeightEntry_userId_date_key" ON "WeightEntry"("userId", "date");

ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
