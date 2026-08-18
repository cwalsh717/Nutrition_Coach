"use client";

// The Library, client-side: one search box over the Cook Book and a flat list
// of Foods. Filtering is live rather than a `?q=` round trip — the whole library
// is already here to render, and a navigation per keystroke would reset scroll
// and throw away whatever card the user has open for editing.
//
// Foods are not sorted into drawers. Each one shows what it can DO — logs on
// Track, joins shopping — read straight off its own data.

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteRecipe } from "@/actions/recipes";
import { createStaple, deleteStaple, updateStaple } from "@/actions/staples";
import { SLOT_LABELS } from "@/lib/constants";
import { filterLibrary, foodCapabilities, type FoodFilter } from "@/lib/library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InfoTip } from "@/components/info-tip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface LibraryRecipe {
  id: string;
  name: string;
  slot: string;
  servings: number;
  kcalPerServing: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface LibraryFood {
  id: string;
  name: string;
  kind: "grocery" | "quick_eat";
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingNote: string;
}

export function LibraryBrowser({
  recipes,
  foods,
}: {
  recipes: LibraryRecipe[];
  foods: LibraryFood[];
}) {
  const [query, setQuery] = useState("");
  const [foodFilter, setFoodFilter] = useState<FoodFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // The open card is pinned so the search box can never hide it mid-edit.
  const buckets = filterLibrary(
    { recipes, foods },
    { query, food: foodFilter, pinnedIds: editingId ? [editingId] : [] },
  );

  const libraryEmpty = recipes.length === 0 && foods.length === 0;
  const searching = query.trim() !== "" || foodFilter !== "all";

  // Changing a filter is an explicit "show me something else" — close the editor
  // rather than dragging it along into a list it may not belong to.
  function pickFilter(next: FoodFilter) {
    setFoodFilter(next);
    setEditingId(null);
  }

  function clearFilters() {
    setQuery("");
    setFoodFilter("all");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Library</h1>
        <Button onClick={() => setAddOpen(true)}>+ Add</Button>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your Cook Book and Foods…"
        aria-label="Search the library"
      />

      {libraryEmpty && (
        <Empty>
          Nothing here yet.{" "}
          <button type="button" onClick={() => setAddOpen(true)} className="underline">
            Add your first item
          </button>{" "}
          — a recipe you cook, or a food you eat.
        </Empty>
      )}

      {!libraryEmpty && searching && buckets.total === 0 && (
        <Empty>
          Nothing matches{query.trim() && <> “{query.trim()}”</>}.{" "}
          <button type="button" onClick={clearFilters} className="underline">
            Clear the search
          </button>
          .
        </Empty>
      )}

      {/* ---------- Cook Book ---------- */}
      <section className="space-y-2">
        <SectionHeading title="Cook Book" count={buckets.recipes.length}>
          Recipes you make. Read one in from a paste or enter it by hand, plan it
          into a week, and log a single serving from Track.
        </SectionHeading>

        {recipes.length === 0 ? (
          <Empty>
            Your Cook Book is where the meals you cook live. Paste one in and the
            advisor reads the ingredients and macros for you, or type one by hand.
            Once it&apos;s here you can plan it into a week and log a serving on
            Track.
          </Empty>
        ) : (
          <div className="grid gap-2">
            {buckets.recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- Foods ---------- */}
      <section className="space-y-2">
        <SectionHeading title="Foods" count={buckets.foods.length}>
          Anything you eat or buy that isn&apos;t a recipe. Give one calories and
          it becomes a one-tap log on Track; turn on the store toggle and it can
          join a week and your shopping list. Plenty of foods are both.
        </SectionHeading>

        {foods.length === 0 ? (
          <Empty>
            Foods are anything you eat or buy that isn&apos;t a recipe. Give one
            calories and it becomes a one-tap log on Track; mark it a store item
            and it can join your shopping list.
          </Empty>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 text-sm">
              <FilterChip label="All" active={foodFilter === "all"} onClick={() => pickFilter("all")} />
              <FilterChip label="Track items" active={foodFilter === "track"} onClick={() => pickFilter("track")} />
              <FilterChip label="Shopping items" active={foodFilter === "shopping"} onClick={() => pickFilter("shopping")} />
            </div>
            <div className="grid gap-2">
              {buckets.foods.map((f) => (
                <FoodCard key={f.id} food={f} editing={editingId === f.id} onEdit={setEditingId} />
              ))}
            </div>
          </>
        )}
      </section>

      <AddDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function SectionHeading({
  title, count, children,
}: {
  title: string; count: number; children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 font-display text-xl">
      {title}
      {count > 0 && <span className="text-sm font-normal text-muted-foreground">{count}</span>}
      <InfoTip>{children}</InfoTip>
    </h2>
  );
}

function RecipeCard({ recipe: r }: { recipe: LibraryRecipe }) {
  const [pending, startTransition] = useTransition();

  // Delete is refused for a recipe any week still references. The action returns
  // that reason rather than throwing, so the message survives production and the
  // page keeps its search, filters and open editor.
  function remove() {
    startTransition(async () => {
      const res = await deleteRecipe(r.id);
      if (!res.ok) toast.error(res.error);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{r.name}</span>
          <Badge variant="secondary">{SLOT_LABELS[r.slot] ?? r.slot}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {r.servings} servings · {r.kcalPerServing} kcal · {r.proteinG}p / {r.carbsG}c / {r.fatG}f per serving
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button asChild variant="outline" size="sm">
            <Link href={`/cookbook/${r.id}`}>Edit</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={pending}
            onClick={remove}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FoodCard({
  food, editing, onEdit,
}: {
  food: LibraryFood; editing: boolean; onEdit: (id: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const caps = foodCapabilities(food);

  if (!editing) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
          <span className="font-medium">{food.name}</span>
          {food.servingNote && (
            <span className="text-sm text-muted-foreground">{food.servingNote}</span>
          )}
          {food.kcal !== null && (
            <span className="text-sm text-muted-foreground">{macroSummary(food)}</span>
          )}
          <div className="flex flex-wrap gap-1">
            {caps.logsOnTrack && <Badge variant="secondary">Logs on Track</Badge>}
            {caps.shoppingItem && <Badge variant="secondary">Shopping item</Badge>}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => onEdit(food.id)}
          >
            Edit
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <form
          action={(fd) =>
            startTransition(async () => {
              await updateStaple(food.id, fd);
              onEdit(null);
              toast.success(`Saved ${String(fd.get("name") ?? "").trim()}`);
            })
          }
          className="space-y-3"
        >
          <FoodFields food={food} />
          <div className="flex flex-wrap gap-1.5">
            <Button type="submit" variant="outline" size="sm" disabled={pending}>Save</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(null)}>
              Cancel
            </Button>
            <Button
              formAction={deleteStaple.bind(null, food.id)}
              variant="ghost"
              size="sm"
              className="text-destructive"
            >
              Delete
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * The whole food form: a name, macros, a serving note, and the store toggle.
 * Nothing else — no aisle, no quantity per week.
 */
function FoodFields({ food }: { food?: LibraryFood }) {
  const [storeItem, setStoreItem] = useState(food ? food.kind === "grocery" : false);

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Name" className="min-w-44 flex-1">
          <Input name="name" defaultValue={food?.name} placeholder="Iced tea, Chipotle bowl…" required />
        </Field>
        <Field label="Serving" className="min-w-40 flex-1">
          <Input
            name="servingNote"
            defaultValue={food?.servingNote}
            placeholder="1 can · chicken, rice, beans"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="kcal">
          <Input name="kcal" inputMode="numeric" defaultValue={food?.kcal ?? ""} className="w-20" />
        </Field>
        <Field label="Protein">
          <Input name="proteinG" inputMode="numeric" defaultValue={food?.proteinG ?? ""} className="w-16" />
        </Field>
        <Field label="Carbs">
          <Input name="carbsG" inputMode="numeric" defaultValue={food?.carbsG ?? ""} className="w-16" />
        </Field>
        <Field label="Fat">
          <Input name="fatG" inputMode="numeric" defaultValue={food?.fatG ?? ""} className="w-16" />
        </Field>
      </div>

      <div>
        {/* An unchecked box submits nothing, so the hidden input is what the
            action actually reads — same pattern as the ingredient rows. */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={storeItem}
            onChange={(e) => setStoreItem(e.target.checked)}
          />
          I buy this at the store
        </label>
        <input type="hidden" name="kind" value={storeItem ? "grocery" : "quick_eat"} />
        <p className="mt-1 text-xs text-muted-foreground">
          Store items can be picked into a week and show up on that week&apos;s
          shopping list.
        </p>
      </div>
    </>
  );
}

/** One "+ Add" door with three rooms — a recipe you paste, a recipe you type,
 *  or a food. */
function AddDialog({
  open, onOpenChange,
}: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const [addingFood, setAddingFood] = useState(false);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    onOpenChange(next);
    if (!next) setAddingFood(false);
  }

  function save(fd: FormData) {
    const name = String(fd.get("name") ?? "").trim();
    startTransition(async () => {
      await createStaple(fd);
      change(false);
      toast.success(`Added ${name}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{addingFood ? "New food" : "Add to your Library"}</DialogTitle>
          <DialogDescription>
            {addingFood
              ? "Anything you eat or buy that isn't a recipe."
              : "What is it? Each answer gets the form that fits it."}
          </DialogDescription>
        </DialogHeader>

        {!addingFood && (
          <div className="grid gap-2">
            <Choice as={Link} href="/ingest" title="Paste a recipe" sub="Drop in text from anywhere and let the advisor read it." />
            <Choice as={Link} href="/cookbook/new" title="Recipe by hand" sub="Type the ingredients and macros yourself." />
            <Choice onClick={() => setAddingFood(true)} title="Food" sub="Anything that isn't a recipe — a snack, a drink, an order." />
          </div>
        )}

        {addingFood && (
          <form action={save} className="space-y-3">
            <FoodFields />
            <div className="flex flex-wrap gap-1.5">
              <Button type="submit" disabled={pending}>Add</Button>
              <Button type="button" variant="ghost" onClick={() => setAddingFood(false)}>Back</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  as, href, onClick, title, sub,
}: {
  as?: typeof Link; href?: string; onClick?: () => void; title: string; sub: string;
}) {
  const inner = (
    <>
      <div className="font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </>
  );
  const className = "rounded-lg border px-3 py-2.5 text-left hover:bg-accent";
  return as && href ? (
    <Link href={href} className={className}>{inner}</Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>{inner}</button>
  );
}

function FilterChip({
  label, active, onClick,
}: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1",
        active ? "border-primary bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      {label}
    </button>
  );
}

function macroSummary(food: LibraryFood): string {
  const macros = [
    food.proteinG !== null && `${food.proteinG}p`,
    food.carbsG !== null && `${food.carbsG}c`,
    food.fatG !== null && `${food.fatG}f`,
  ].filter(Boolean).join(" / ");
  return macros ? `${food.kcal} kcal · ${macros}` : `${food.kcal} kcal`;
}

function Field({ label, children, className }: {
  label: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}
