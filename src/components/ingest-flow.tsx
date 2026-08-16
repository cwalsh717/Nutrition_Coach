"use client";

// The paste lives in React state, so no parse failure — API error, bad JSON,
// even a server 500 — can lose it. On success we swap to the review form.

import { useState, useTransition } from "react";
import { parseRecipeAction } from "@/actions/recipes";
import { createRecipe } from "@/actions/recipes";
import type { ParsedRecipe } from "@/lib/claude/parse-recipe";
import { RecipeForm, type RecipeFormValues } from "@/components/recipe-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function toFormValues(parsed: ParsedRecipe, sourceHint: string): RecipeFormValues {
  return {
    name: parsed.name,
    source: sourceHint,
    servings: parsed.servings,
    kcalPerServing: parsed.kcal_per_serving,
    proteinG: parsed.protein_g,
    carbsG: parsed.carbs_g,
    fatG: parsed.fat_g,
    slot: parsed.slot,
    notes: "",
    ingredients: parsed.ingredients.map((ing) => ({
      name: ing.name,
      qty: ing.qty,
      unit: ing.unit,
      department: ing.department,
      stapleHint: ing.staple_hint,
    })),
  };
}

export function IngestFlow({ targetWeek }: { targetWeek: { id: string; label: string } | null }) {
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState("");
  const [parsed, setParsed] = useState<RecipeFormValues | null>(null);
  const [pending, startTransition] = useTransition();

  function parse() {
    setError("");
    startTransition(async () => {
      const result = await parseRecipeAction(rawText);
      if (result.ok) {
        setParsed(toFormValues(result.recipe, ""));
      } else {
        setError(result.error);
      }
    });
  }

  if (parsed) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Review the parse</h1>
            <p className="text-sm text-muted-foreground">
              Fix anything the AI got wrong, then save. Nothing is stored until you do.
            </p>
          </div>
          <Button variant="outline" onClick={() => setParsed(null)}>
            ← Back to the paste
          </Button>
        </div>
        <RecipeForm
          initial={parsed}
          rawText={rawText}
          action={createRecipe}
          submitLabel="Save to Cook Book"
          targetWeek={targetWeek}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Read in a recipe</h1>
        <p className="text-sm text-muted-foreground">
          Paste a YouTube description or any recipe text. You&apos;ll review everything
          before it&apos;s saved.
        </p>
      </div>
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">Couldn&apos;t parse that</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {error} Your pasted text is still below — tweak it and try again.
          </CardContent>
        </Card>
      )}
      <Textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={16}
        placeholder="Paste the recipe text here…"
        className="font-mono text-sm"
      />
      <Button onClick={parse} disabled={pending || !rawText.trim()}>
        {pending ? "Reading…" : "Read it in"}
      </Button>
    </div>
  );
}
