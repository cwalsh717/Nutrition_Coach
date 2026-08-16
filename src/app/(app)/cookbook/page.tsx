import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isWeekEditable, rangeLabel } from "@/lib/weeks";
import { localDateKey } from "@/lib/dates";
import { resolveWeek, todayIso } from "@/lib/queries";
import { deleteRecipe, markCooked, setKeeper } from "@/actions/recipes";
import { addRecipeToWeek } from "@/actions/weeks";
import { SLOTS, SLOT_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Search {
  slot?: string;
  keeper?: string;
}

export default async function CookbookPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const { slot, keeper } = await searchParams;

  const where: Record<string, unknown> = { userId: user.id };
  if (slot && (SLOTS as readonly string[]).includes(slot)) where.slot = slot;
  if (keeper === "keeper") where.keeper = true;
  if (keeper === "retired") where.keeper = false;
  if (keeper === "unrated") where.keeper = null;

  const [recipes, resolvedWeek, today] = await Promise.all([
    db.recipe.findMany({ where, orderBy: { name: "asc" } }),
    resolveWeek(user.id),
    todayIso(),
  ]);
  // Only an editable week may receive recipes, and the button names it — an
  // unlabeled "Add to week" writing to a mystery (possibly finished) week was
  // how frozen history got edited.
  const activeWeek =
    resolvedWeek && isWeekEditable(resolvedWeek, today) ? resolvedWeek : null;
  const activeWeekLabel = activeWeek
    ? rangeLabel(activeWeek.weekOf.toISOString().slice(0, 10), activeWeek.dayCount)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cook Book</h1>
        <Button asChild><Link href="/ingest">+ Read in a recipe</Link></Button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-sm">
        <FilterChip href="/cookbook" active={!slot && !keeper} label="All" />
        {SLOTS.map((s) => (
          <FilterChip key={s} href={`/cookbook?slot=${s}`} active={slot === s} label={SLOT_LABELS[s]} />
        ))}
        <span className="mx-1 text-muted-foreground">·</span>
        <FilterChip href="/cookbook?keeper=keeper" active={keeper === "keeper"} label="★ Keepers" />
        <FilterChip href="/cookbook?keeper=unrated" active={keeper === "unrated"} label="Unrated" />
        <FilterChip href="/cookbook?keeper=retired" active={keeper === "retired"} label="Retired" />
      </div>

      {recipes.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nothing here yet. <Link href="/ingest" className="underline">Read in your first recipe</Link>{" "}
            or <Link href="/cookbook/new" className="underline">enter one by hand</Link>.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {recipes.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{r.name}</span>
                <Badge variant="secondary">{SLOT_LABELS[r.slot]}</Badge>
                {r.keeper === true && <Badge>★ keeper</Badge>}
                {r.keeper === false && <Badge variant="outline">retired</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {r.servings} servings · {r.kcalPerServing} kcal · {r.proteinG}p / {r.carbsG}c / {r.fatG}f per serving
                {r.timesMade > 0 && (
                  <> · made {r.timesMade}×{r.lastMade && `, last ${localDateKey(r.lastMade)}`}</>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/cookbook/${r.id}`}>Edit</Link>
                </Button>
                {activeWeek && (
                  <form action={addRecipeToWeek.bind(null, activeWeek.id, r.id, undefined)}>
                    <Button size="sm">Add to {activeWeekLabel}</Button>
                  </form>
                )}
                {!activeWeek && (
                  <span className="self-center text-xs text-muted-foreground">
                    <Link href="/week/new" className="underline">Start a week</Link> to plan it in
                  </span>
                )}
                <form action={markCooked.bind(null, r.id)}>
                  <Button variant="outline" size="sm">Cooked it</Button>
                </form>
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
                <form action={deleteRecipe.bind(null, r.id)}>
                  <Button variant="ghost" size="sm" className="text-destructive">Delete</Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1",
        active ? "border-primary bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      {label}
    </Link>
  );
}
