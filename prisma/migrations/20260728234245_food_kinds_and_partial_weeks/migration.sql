-- CreateEnum
CREATE TYPE "FoodKind" AS ENUM ('grocery', 'quick_eat');

-- AlterTable
ALTER TABLE "Staple" ADD COLUMN     "carbsG" INTEGER,
ADD COLUMN     "fatG" INTEGER,
ADD COLUMN     "kind" "FoodKind" NOT NULL DEFAULT 'grocery',
ADD COLUMN     "servingNote" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Week" ADD COLUMN     "dayCount" INTEGER NOT NULL DEFAULT 7;
