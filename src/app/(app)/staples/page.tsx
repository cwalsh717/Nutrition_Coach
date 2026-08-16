import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createStaple, deleteStaple, updateStaple } from "@/actions/staples";
import { DEPARTMENTS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/info-tip";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

type Food = Awaited<ReturnType<typeof db.staple.findMany>>[number];

// Everything you eat that isn't a cooked recipe, in two flavours:
// Staples (bought weekly, hit the shopping list) and Quick Eats (takeout /
// no-prep, logged straight to the diary). Starts empty for everyone.
export default async function StaplesPage() {
  const user = await requireUser();
  const foods = await db.staple.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
  });
  const staples = foods.filter((f) => f.kind === "grocery");
  const quickEats = foods.filter((f) => f.kind === "quick_eat");

  return (
    <div className="space-y-8">
      <h1 className="flex items-center gap-2 text-2xl">
        Staples &amp; Quick Eats
        <InfoTip>
          Two ways to fill the gaps around your cooked recipes. Staples are
          groceries you rebuy; Quick Eats are takeout and no-prep meals. Both can
          be logged on Track in one tap.
        </InfoTip>
      </h1>

      {/* ---------- Staples ---------- */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-xl">
          Staples
          <InfoTip>
            Groceries you buy again and again. Pick them into a week and they
            land on that week&apos;s shopping list; any with calories count toward
            the bank.
          </InfoTip>
        </h2>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add a staple</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createStaple} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="kind" value="grocery" />
              <Field label="Name" className="min-w-44 flex-1">
                <Input name="name" placeholder="Iced tea, jerky, rice cakes…" required />
              </Field>
              <MacroFields />
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
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>

        {staples.length === 0 ? (
          <Empty>
            Nothing yet. Add the things you always buy — they become one tap on a
            week&apos;s list.
          </Empty>
        ) : (
          staples.map((food) => <FoodRow key={food.id} food={food} />)
        )}
      </section>

      {/* ---------- Quick Eats ---------- */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-xl">
          Quick Eats
          <InfoTip>
            Takeout and no-prep meals you eat often — a Chipotle bowl, a deli
            sandwich. Save the macros once, then log it in one tap. These never
            go on a shopping list.
          </InfoTip>
        </h2>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add a quick eat</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createStaple} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="kind" value="quick_eat" />
              <Field label="Name" className="min-w-44 flex-1">
                <Input name="name" placeholder="Chipotle chicken bowl…" required />
              </Field>
              <Field label="Serving" className="min-w-40 flex-1">
                <Input name="servingNote" placeholder="chicken, rice, black beans" />
              </Field>
              <MacroFields />
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>

        {quickEats.length === 0 ? (
          <Empty>
            Nothing yet. Save the takeout you actually order and logging it stops
            being a chore.
          </Empty>
        ) : (
          quickEats.map((food) => <FoodRow key={food.id} food={food} />)
        )}
      </section>
    </div>
  );
}

function FoodRow({ food }: { food: Food }) {
  const isGrocery = food.kind === "grocery";
  return (
    <Card>
      <CardContent className="py-4">
        <form action={updateStaple.bind(null, food.id)} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="kind" value={food.kind} />
          <Field label="Name" className="min-w-44 flex-1">
            <Input name="name" defaultValue={food.name} />
          </Field>
          {!isGrocery && (
            <Field label="Serving" className="min-w-40 flex-1">
              <Input name="servingNote" defaultValue={food.servingNote} />
            </Field>
          )}
          <MacroFields food={food} />
          {isGrocery && (
            <>
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
            </>
          )}
          <Button type="submit" variant="outline" size="sm">Save</Button>
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

function MacroFields({ food }: { food?: Food }) {
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
