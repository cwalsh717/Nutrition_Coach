import { createRecipe } from "@/actions/recipes";
import { RecipeForm, emptyRecipe } from "@/components/recipe-form";

export default function NewRecipePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">New recipe (manual)</h1>
      <RecipeForm initial={emptyRecipe()} rawText="" action={createRecipe} submitLabel="Save to Cook Book" />
    </div>
  );
}
