"use client";

// The Library, client-side: one search box over recipes, groceries and takeout.
// Filtering is live rather than a `?q=` round trip — the whole library is
// already here to render, and a navigation per keystroke would reset scroll and
// throw away whatever card the user has open for editing.

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteRecipe, setKeeper } from "@/actions/recipes";
import { createStaple, deleteStaple, updateStaple } from "@/actions/staples";
import { DEPARTMENTS, SLOTS, SLOT_LABELS } from "@/lib/constants";
import { filterLibrary, type KeeperFilter, type LibraryType } from "@/lib/library";
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
  keeper: boolean | null;
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
  defaultQty: number;
  department: string;
}

export function LibraryBrowser({
  recipes,
  foods,
}: {
  recipes: LibraryRecipe[];
  foods: LibraryFood[];
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<LibraryType>("all");
  const [keeperFilter, setKeeperFilter] = useState<KeeperFilter>("all");
  const [slot, setSlot] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // The open card is pinned so the search box can never hide it mid-edit.
  const buckets = filterLibrary(
    { recipes, foods },
    { query, type, keeper: keeperFilter, slot, pinnedIds: editingId ? [editingId] : [] },
  );

  const libraryEmpty = recipes.length === 0 && foods.length === 0;
  const showRecipeFilters = type === "all" || type === "recipes";

  // Changing a filter is an explicit "show me something else" — close the editor
  // rather than dragging it along into a list it may not belong to.
  function pick<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setEditingId(null);
    };
  }
  const pickType = pick(setType);
  const pickKeeper = pick(setKeeperFilter);

  function clearFilters() {
    setQuery("");
    setType("all");
    setKeeperFilter("all");
    setSlot("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          Library
          <InfoTip>
            Everything you eat, in one place: recipes you cook, groceries you
            rebuy, and takeout you order. The Library only stores things — plan a
            week on the Week page, log what you actually ate on Track.
          </InfoTip>
        </h1>
        <Button onClick={() => setAddOpen(true)}>+ Add</Button>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search recipes, groceries and takeout…"
        aria-label="Search the library"
      />

      <div className="flex flex-wrap gap-1.5 text-sm">
        <FilterChip label="All" active={type === "all"} onClick={() => pickType("all")} />
        <FilterChip label="Recipes" active={type === "recipes"} onClick={() => pickType("recipes")} />
        <FilterChip label="Groceries" active={type === "groceries"} onClick={() => pickType("groceries")} />
        <FilterChip label="Takeout" active={type === "takeout"} onClick={() => pickType("takeout")} />
      </div>

      {showRecipeFilters && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">Recipes:</span>
          <FilterChip
            label="★ Keepers"
            active={keeperFilter === "keeper"}
            onClick={() => pickKeeper(keeperFilter === "keeper" ? "all" : "keeper")}
          />
          <FilterChip
            label="Unrated"
            active={keeperFilter === "unrated"}
            onClick={() => pickKeeper(keeperFilter === "unrated" ? "all" : "unrated")}
          />
          <FilterChip
            label="Retired"
            active={keeperFilter === "retired"}
            onClick={() => pickKeeper(keeperFilter === "retired" ? "all" : "retired")}
          />
          <select
            value={slot}
            onChange={(e) => {
              setSlot(e.target.value);
              setEditingId(null);
            }}
            aria-label="Filter recipes by slot"
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
          >
            <option value="">Any slot</option>
            {SLOTS.map((s) => (
              <option key={s} value={s}>{SLOT_LABELS[s]}</option>
            ))}
          </select>
        </div>
      )}

      {libraryEmpty && (
        <Empty>
          Nothing here yet.{" "}
          <button type="button" onClick={() => setAddOpen(true)} className="underline">
            Add your first item
          </button>{" "}
          — a recipe, a grocery you rebuy, or the takeout you order.
        </Empty>
      )}

      {!libraryEmpty && buckets.total === 0 && (
        <Empty>
          Nothing matches{query.trim() && <> “{query.trim()}”</>}.{" "}
          <button type="button" onClick={clearFilters} className="underline">
            Clear the search and filters
          </button>
          .
        </Empty>
      )}

      <Section
        title="Recipes"
        count={buckets.recipes.length}
        tip="Meals you cook. Plan them into a week on the Week page; tap one on Track to log a single serving."
      >
        {buckets.recipes.map((r) => (
          <RecipeCard key={r.id} recipe={r} />
        ))}
      </Section>

      <Section
        title="Groceries"
        count={buckets.groceries.length}
        tip="Things you buy again and again. Pick them into a week and they land on that week's shopping list; any with calories count toward the bank."
      >
        {buckets.groceries.map((f) => (
          <FoodCard key={f.id} food={f} editing={editingId === f.id} onEdit={setEditingId} />
        ))}
      </Section>

      <Section
        title="Takeout"
        count={buckets.takeout.length}
        tip="Takeout and no-prep meals you order often. Save the macros once, then log it in one tap. These never go on a shopping list."
      >
        {buckets.takeout.map((f) => (
          <FoodCard key={f.id} food={f} editing={editingId === f.id} onEdit={setEditingId} />
        ))}
      </Section>

      <AddDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

/** A section with nothing in it renders nothing — no empty shells. */
function Section({
  title, count, tip, children,
}: {
  title: string; count: number; tip: string; children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-display text-xl">
        {title}
        <span className="text-sm font-normal text-muted-foreground">{count}</span>
        <InfoTip>{tip}</InfoTip>
      </h2>
      <div className="grid gap-2">{children}</div>
    </section>
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
          {r.keeper === true && <Badge>★ keeper</Badge>}
          {r.keeper === false && <Badge variant="outline">retired</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {r.servings} servings · {r.kcalPerServing} kcal · {r.proteinG}p / {r.carbsG}c / {r.fatG}f per serving
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button asChild variant="outline" size="sm">
            <Link href={`/cookbook/${r.id}`}>Edit</Link>
          </Button>
          {r.keeper !== true && (
            <form action={setKeeper.bind(null, r.id, true)}>
              <Button variant="outline" size="sm">★ Keeper</Button>
            </form>
          )}
          {r.keeper !== false && (
            <form action={setKeeper.bind(null, r.id, false)}>
              <Button variant="outline" size="sm">Retire</Button>
            </form>
          )}
          {r.keeper !== null && (
            <form action={setKeeper.bind(null, r.id, null)}>
              <Button variant="ghost" size="sm">Clear rating</Button>
            </form>
          )}
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
  // Which section this card sits in is decided by food.kind (the PROP). This
  // state drives the open form's shape only — grouping on it would re-parent the
  // card the moment the select changed, unmounting the form mid-edit.
  const [kind, setKind] = useState(food.kind);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
          <span className="font-medium">{food.name}</span>
          {food.servingNote && (
            <span className="text-sm text-muted-foreground">{food.servingNote}</span>
          )}
          <span className="text-sm text-muted-foreground">{macroSummary(food)}</span>
          {food.kind === "grocery" && (
            <span className="text-xs text-muted-foreground">
              ×{food.defaultQty}/week · {food.department}
            </span>
          )}
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
          className="flex flex-wrap items-end gap-2"
        >
          <Field label="Name" className="min-w-44 flex-1">
            <Input name="name" defaultValue={food.name} required />
          </Field>

          <Field label="Kind">
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as LibraryFood["kind"])}
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
            >
              <option value="grocery">Grocery</option>
              <option value="quick_eat">Takeout</option>
            </select>
          </Field>

          {/* Every field stays MOUNTED whatever the kind — updateStaple reads
              servingNote, defaultQty and department unconditionally, so an
              unrendered one would save as blank / 1 / "Other" and quietly wipe
              what's stored. Hidden inputs still submit, so flipping grocery →
              takeout → grocery loses nothing. One name per field: FormData.get
              returns only the first, so mirrored inputs would be a coin toss. */}
          <div className={cn("min-w-40 flex-1", kind !== "quick_eat" && "hidden")}>
            <Field label="Serving">
              <Input name="servingNote" defaultValue={food.servingNote} />
            </Field>
          </div>

          <MacroFields food={food} />

          <div className={cn("flex items-end gap-2", kind !== "grocery" && "hidden")}>
            <Field label="Qty/week">
              <Input name="defaultQty" inputMode="numeric" defaultValue={food.defaultQty} className="w-16" />
            </Field>
            <Field label="Aisle">
              <select
                name="department"
                defaultValue={food.department}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
          </div>

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
        </form>
      </CardContent>
    </Card>
  );
}

/** One "+ Add" door with four rooms — the question is what the thing IS, so a
 *  burrito never meets a form demanding an aisle. */
function AddDialog({
  open, onOpenChange,
}: {
  open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const [mode, setMode] = useState<null | "grocery" | "quick_eat">(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    onOpenChange(next);
    if (!next) setMode(null);
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
          <DialogTitle>
            {mode === null ? "Add to your Library" : mode === "grocery" ? "New grocery" : "New takeout"}
          </DialogTitle>
          <DialogDescription>
            {mode === null
              ? "What is it? Each answer gets the form that fits it."
              : mode === "grocery"
                ? "Something you buy at the store and rebuy most weeks."
                : "Takeout or a no-prep meal you order. No aisle, no weekly quantity."}
          </DialogDescription>
        </DialogHeader>

        {mode === null && (
          <div className="grid gap-2">
            <Choice as={Link} href="/ingest" title="Paste a recipe" sub="Drop in text from anywhere and let the advisor read it." />
            <Choice as={Link} href="/cookbook/new" title="Recipe by hand" sub="Type the ingredients and macros yourself." />
            <Choice onClick={() => setMode("grocery")} title="Grocery item" sub="Rebought weekly. Has a quantity and an aisle." />
            <Choice onClick={() => setMode("quick_eat")} title="Takeout / order" sub="Logged straight to the diary. Never shopped for." />
          </div>
        )}

        {mode !== null && (
          <form action={save} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="kind" value={mode} />
            <Field label="Name" className="min-w-44 flex-1">
              <Input
                name="name"
                required
                autoFocus
                placeholder={mode === "grocery" ? "Iced tea, jerky, rice cakes…" : "Chipotle chicken bowl…"}
              />
            </Field>
            {mode === "quick_eat" && (
              <Field label="Serving" className="min-w-40 flex-1">
                <Input name="servingNote" placeholder="chicken, rice, black beans" />
              </Field>
            )}
            <MacroFields />
            {mode === "grocery" && (
              <>
                <Field label="Qty/week">
                  <Input name="defaultQty" inputMode="numeric" defaultValue={1} className="w-16" />
                </Field>
                <Field label="Aisle">
                  <select
                    name="department"
                    defaultValue="Other"
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Button type="submit" disabled={pending}>Add</Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>Back</Button>
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
  if (food.kcal === null) return "no calories saved";
  const macros = [
    food.proteinG !== null && `${food.proteinG}p`,
    food.carbsG !== null && `${food.carbsG}c`,
    food.fatG !== null && `${food.fatG}f`,
  ].filter(Boolean).join(" / ");
  return macros ? `${food.kcal} kcal · ${macros}` : `${food.kcal} kcal`;
}

function MacroFields({ food }: { food?: LibraryFood }) {
  return (
    <>
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
    </>
  );
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
