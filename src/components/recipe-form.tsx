"use client";

// Shared by: ingest review (parsed recipe prefilled), cookbook new (blank),
// cookbook edit (existing recipe). Submits to whichever server action the
// parent passed in. Ingredient rows are plain parallel-named inputs; a row
// with a blanked name is treated as deleted by the server.

import { useState, useTransition } from "react";
import { DEPARTMENTS, SLOTS, SLOT_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/info-tip";
import { Trash2 } from "lucide-react";

export interface RecipeFormValues {
  name: string;
  source: string;
  servings: number;
  kcalPerServing: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  slot: string;
  notes: string;
  ingredients: {
    name: string;
    qty: number | null;
    unit: string;
    department: string;
    stapleHint: boolean;
  }[];
}

export function emptyRecipe(): RecipeFormValues {
  return {
    name: "", source: "", servings: 4, kcalPerServing: 0, proteinG: 0,
    carbsG: 0, fatG: 0, slot: "main", notes: "", ingredients: [],
  };
}

interface Props {
  /** Omit for a blank form. It defaults HERE rather than at the call site
   *  because emptyRecipe() lives in this "use client" module — a server page
   *  calling it directly crashes ("cannot invoke a client function"). */
  initial?: RecipeFormValues;
  rawText?: string;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  /** The editable week an ingest save may also target — id + display label.
   *  Null/absent = no checkbox (no editable week, or cookbook edit context). */
  targetWeek?: { id: string; label: string } | null;
}

interface Row {
  name: string;
  qty: string; // kept as text while typing; server parses
  unit: string;
  department: string;
  stapleHint: boolean;
}

export function RecipeForm({
  initial = emptyRecipe(), rawText, action, submitLabel, targetWeek,
}: Props) {
  const [rows, setRows] = useState<Row[]>(
    initial.ingredients.length > 0
      ? initial.ingredients.map((ing) => ({ ...ing, qty: ing.qty === null ? "" : String(ing.qty) }))
      : [{ name: "", qty: "", unit: "", department: "Other", stapleHint: false }],
  );
  const [pending, startTransition] = useTransition();

  function addRow() {
    setRows([...rows, { name: "", qty: "", unit: "", department: "Other", stapleHint: false }]);
  }
  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }
  function patchRow(index: number, patch: Partial<(typeof rows)[number]>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submit(formData: FormData) {
    startTransition(() => action(formData));
  }

  return (
    <form action={submit} className="space-y-6">
      {rawText !== undefined && <input type="hidden" name="rawText" value={rawText} />}

      <Card>
        <CardHeader><CardTitle>Recipe</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={initial.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Source (URL or note)</Label>
              <Input id="source" name="source" defaultValue={initial.source} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            <SmallNumber label="Servings" name="servings" defaultValue={initial.servings} min={1} />
            <SmallNumber label="kcal/srv" name="kcalPerServing" defaultValue={initial.kcalPerServing} />
            <SmallNumber label="Protein g" name="proteinG" defaultValue={initial.proteinG} />
            <SmallNumber label="Carbs g" name="carbsG" defaultValue={initial.carbsG} />
            <SmallNumber label="Fat g" name="fatG" defaultValue={initial.fatG} />
            <div className="space-y-1.5">
              <Label htmlFor="slot">Slot</Label>
              <select id="slot" name="slot" defaultValue={initial.slot}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                {SLOTS.map((s) => <option key={s} value={s}>{SLOT_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Ingredients
            <InfoTip>
              Leave qty empty for &quot;to taste&quot;. &quot;Usually on hand&quot; only sorts the
              shopping review — nothing is ever removed automatically.
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 md:flex-nowrap">
              <Input
                name="ingName" value={row.name} placeholder="ingredient"
                onChange={(e) => patchRow(i, { name: e.target.value })}
                className="min-w-40 flex-1"
              />
              <Input
                name="ingQty" value={row.qty} placeholder="qty" inputMode="decimal"
                onChange={(e) => patchRow(i, { qty: e.target.value })}
                className="w-20"
              />
              <Input
                name="ingUnit" value={row.unit} placeholder="unit"
                onChange={(e) => patchRow(i, { unit: e.target.value })}
                className="w-20"
              />
              <select
                name="ingDepartment" value={row.department}
                onChange={(e) => patchRow(i, { department: e.target.value })}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={row.stapleHint}
                  onChange={(e) => patchRow(i, { stapleHint: e.target.checked })}
                />
                usually on hand
              </label>
              {/* hidden mirror so unchecked boxes still submit a value in order */}
              <input type="hidden" name="ingStapleHint" value={String(row.stapleHint)} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)} aria-label="Remove row">
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            + Add ingredient
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea name="notes" defaultValue={initial.notes} rows={2} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        {targetWeek && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="addToWeek" value="true" />
            <input type="hidden" name="targetWeekId" value={targetWeek.id} />
            also add to {targetWeek.label}
          </label>
        )}
      </div>
    </form>
  );
}

function SmallNumber({ label, name, defaultValue, min = 0 }: {
  label: string; name: string; defaultValue: number; min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="number" min={min} defaultValue={defaultValue} />
    </div>
  );
}
