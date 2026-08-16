-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('lose', 'gain', 'maintain', 'eat_cleaner');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('sedentary', 'light', 'moderate', 'very', 'extra');

-- CreateEnum
CREATE TYPE "Slot" AS ENUM ('main', 'breakfast', 'snack', 'shake', 'simple_lunch');

-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('planning', 'shopping', 'cooking', 'done');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('unreviewed', 'have', 'need');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('manual', 'advisor');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalType" "GoalType",
    "sex" TEXT,
    "age" INTEGER,
    "heightIn" INTEGER,
    "weightLb" INTEGER,
    "goalWeightLb" INTEGER,
    "activityLevel" "ActivityLevel",
    "weeklyKcalBudget" INTEGER,
    "proteinLowGDay" INTEGER,
    "proteinHighGDay" INTEGER,
    "aboutMe" TEXT NOT NULL DEFAULT '',
    "onboardedAt" TIMESTAMP(3),

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "servings" INTEGER NOT NULL DEFAULT 4,
    "kcalPerServing" INTEGER NOT NULL DEFAULT 0,
    "proteinG" INTEGER NOT NULL DEFAULT 0,
    "carbsG" INTEGER NOT NULL DEFAULT 0,
    "fatG" INTEGER NOT NULL DEFAULT 0,
    "slot" "Slot" NOT NULL DEFAULT 'main',
    "keeper" BOOLEAN,
    "timesMade" INTEGER NOT NULL DEFAULT 0,
    "lastMade" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawText" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT 'Other',
    "stapleHint" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staple" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kcal" INTEGER,
    "proteinG" INTEGER,
    "defaultQty" INTEGER NOT NULL DEFAULT 1,
    "department" TEXT NOT NULL DEFAULT 'Other',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "status" "WeekStatus" NOT NULL DEFAULT 'planning',
    "budgetKcal" INTEGER,
    "proteinLowGDay" INTEGER,
    "proteinHighGDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listBuiltAt" TIMESTAMP(3),
    "listFinalizedAt" TIMESTAMP(3),

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekRecipe" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "portions" INTEGER NOT NULL,

    CONSTRAINT "WeekRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekStaple" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "stapleId" TEXT,
    "name" TEXT NOT NULL,
    "kcal" INTEGER,
    "proteinG" INTEGER,
    "department" TEXT NOT NULL DEFAULT 'Other',
    "qty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WeekStaple_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT 'Other',
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likelyHave" BOOLEAN NOT NULL DEFAULT false,
    "status" "ItemStatus" NOT NULL DEFAULT 'unreviewed',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodLogEntry" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "proteinG" INTEGER,
    "carbsG" INTEGER,
    "fatG" INTEGER,
    "source" "EntrySource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Recipe_userId_idx" ON "Recipe"("userId");

-- CreateIndex
CREATE INDEX "Staple_userId_idx" ON "Staple"("userId");

-- CreateIndex
CREATE INDEX "Week_userId_status_idx" ON "Week"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WeekRecipe_weekId_recipeId_key" ON "WeekRecipe"("weekId", "recipeId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_weekId_idx" ON "ShoppingListItem"("weekId");

-- CreateIndex
CREATE INDEX "ChatMessage_weekId_createdAt_idx" ON "ChatMessage"("weekId", "createdAt");

-- CreateIndex
CREATE INDEX "FoodLogEntry_weekId_date_idx" ON "FoodLogEntry"("weekId", "date");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staple" ADD CONSTRAINT "Staple_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekRecipe" ADD CONSTRAINT "WeekRecipe_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekRecipe" ADD CONSTRAINT "WeekRecipe_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekStaple" ADD CONSTRAINT "WeekStaple_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekStaple" ADD CONSTRAINT "WeekStaple_stapleId_fkey" FOREIGN KEY ("stapleId") REFERENCES "Staple"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLogEntry" ADD CONSTRAINT "FoodLogEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;
