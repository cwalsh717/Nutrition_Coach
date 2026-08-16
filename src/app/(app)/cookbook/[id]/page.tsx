import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { updateRecipe } from "@/actions/recipes";
import { RecipeForm } from "@/components/recipe-form";

export const dynamic = "force-dynamic";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const recipe = await db.recipe.findUnique({
    where: { id },
    include: { ingredients: { orderBy: { sortOrder: "asc" } } },
  });
  if (!recipe || recipe.userId !== user.id) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Edit: {recipe.name}</h1>
      <RecipeForm
        initial={{
          name: recipe.name,
          source: recipe.source,
          servings: recipe.servings,
          kcalPerServing: recipe.kcalPerServing,
          proteinG: recipe.proteinG,
          carbsG: recipe.carbsG,
          fatG: recipe.fatG,
          slot: recipe.slot,
          notes: recipe.notes,
          ingredients: recipe.ingredients.map((ing) => ({
            name: ing.name,
            qty: ing.qty,
            unit: ing.unit,
            department: ing.department,
            stapleHint: ing.stapleHint,
          })),
        }}
        action={updateRecipe.bind(null, recipe.id)}
        submitLabel="Save changes"
      />
      {recipe.rawText && (
        <details className="rounded-lg border p-4 text-sm">
          <summary className="cursor-pointer font-medium">Original pasted text</summary>
          <pre className="mt-2 whitespace-pre-wrap text-muted-foreground">{recipe.rawText}</pre>
        </details>
      )}
    </div>
  );
}
