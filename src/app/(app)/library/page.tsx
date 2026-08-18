import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { LibraryBrowser } from "@/components/library-browser";

export const dynamic = "force-dynamic";

/**
 * The Library: one home for everything you eat — cooked recipes, the groceries
 * you rebuy, and the takeout you order. This page only stores; the week page
 * builds a plan and Track logs what you actually ate.
 *
 * Fetch and hand off. The columns are named explicitly because the rows cross
 * into a client component: a bare findMany would ship every recipe's rawText
 * (the whole original paste) into the payload on every render.
 */
export default async function LibraryPage() {
  const user = await requireUser();

  const [recipes, foods] = await Promise.all([
    db.recipe.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, slot: true, servings: true, kcalPerServing: true,
        proteinG: true, carbsG: true, fatG: true, keeper: true,
      },
    }),
    db.staple.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, kind: true, kcal: true, proteinG: true,
        carbsG: true, fatG: true, servingNote: true, defaultQty: true, department: true,
      },
    }),
  ]);

  return <LibraryBrowser recipes={recipes} foods={foods} />;
}
