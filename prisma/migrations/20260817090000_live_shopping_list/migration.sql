-- Live shopping list: user-added rows carry a free-text note. Additive only.
ALTER TABLE "ShoppingListItem" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShoppingListItem" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
