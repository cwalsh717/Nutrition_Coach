-- Days deliberately not tracked. Additive only.

CREATE TABLE "UntrackedDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UntrackedDay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UntrackedDay_userId_date_idx" ON "UntrackedDay"("userId", "date");
CREATE UNIQUE INDEX "UntrackedDay_userId_date_key" ON "UntrackedDay"("userId", "date");

ALTER TABLE "UntrackedDay" ADD CONSTRAINT "UntrackedDay_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
