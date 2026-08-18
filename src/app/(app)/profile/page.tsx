import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getEnergyStatus } from "@/lib/queries";
import { saveProfile, updateAccountName } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InfoTip } from "@/components/info-tip";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const sessionUser = await requireUser();
  const [account, profile, energy] = await Promise.all([
    db.user.findUnique({ where: { id: sessionUser.id } }),
    db.profile.findUnique({ where: { userId: sessionUser.id } }),
    getEnergyStatus(sessionUser.id),
  ]);
  if (!account || !profile) return null;

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl">
        Profile
        <InfoTip>
          Everything here is optional — the math and the coach adapt to what you
          fill in. Nothing is ever pre-filled for you.
        </InfoTip>
      </h1>

      {/* Who you are — the account itself, not the nutrition profile. */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <form action={updateAccountName} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="accountName">Name</Label>
                <Input id="accountName" name="name" defaultValue={account.name} className="w-56" />
              </div>
              <Button type="submit" variant="outline">Save name</Button>
            </form>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-sm">
              <div>
                Signed in as <strong className="text-primary">{account.email}</strong>
              </div>
              <div className="text-muted-foreground">
                Member since {account.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
              <Link href="/about" className="underline text-muted-foreground hover:text-foreground">
                How Prep Coach works
              </Link>
            </div>
            <LogoutButton />
          </div>
        </CardContent>
      </Card>

      <form action={saveProfile} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Goal & vitals</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="goalType">Goal</Label>
              <select id="goalType" name="goalType" defaultValue={profile.goalType ?? ""}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                <option value="">—</option>
                <option value="lose">Lose weight</option>
                <option value="gain">Gain weight</option>
                <option value="maintain">Maintain</option>
                <option value="eat_cleaner">Eat cleaner</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sex">Sex</Label>
              <select id="sex" name="sex" defaultValue={profile.sex ?? ""}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <NumberField label="Age" name="age" defaultValue={profile.age} />
            <NumberField label="Height (inches)" name="heightIn" defaultValue={profile.heightIn} />
            <NumberField label="Weight (lb)" name="weightLb" defaultValue={profile.weightLb} />
            <NumberField label="Goal weight (lb)" name="goalWeightLb" defaultValue={profile.goalWeightLb} />
            <div className="space-y-1.5">
              <Label htmlFor="activityLevel">Activity</Label>
              <select id="activityLevel" name="activityLevel" defaultValue={profile.activityLevel ?? ""}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                <option value="">—</option>
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="very">Very active</option>
                <option value="extra">Extra active</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Targets
              <InfoTip>
                New weeks copy these at creation, so a finished week keeps the
                numbers it was planned with.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <NumberField label="Weekly calorie bank" name="weeklyKcalBudget" defaultValue={profile.weeklyKcalBudget} />
            <div className="space-y-1.5">
              <Label htmlFor="bankToleranceKcal" className="flex items-center gap-1.5">
                Bank tolerance (kcal)
                <InfoTip>
                  How far off the bank a week can land and still count as on
                  target. A week is a win at or under bank + tolerance.
                </InfoTip>
              </Label>
              <Input
                id="bankToleranceKcal"
                name="bankToleranceKcal"
                inputMode="numeric"
                defaultValue={profile.bankToleranceKcal}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maintenanceKcal" className="flex items-center gap-1.5">
                Maintenance (kcal/day)
                <InfoTip>
                  What you burn in a day — BMR plus daily movement. Leave it
                  blank and the app works it out from your vitals, then
                  corrects itself from your logs and weigh-ins as they come in.
                  Type a number to pin it.
                </InfoTip>
              </Label>
              <Input
                id="maintenanceKcal"
                name="maintenanceKcal"
                inputMode="numeric"
                defaultValue={profile.maintenanceKcal ?? ""}
                placeholder={
                  energy.maintenance.value !== null && energy.maintenance.source !== "manual"
                    ? `auto: ${energy.maintenance.value.toLocaleString()}`
                    : undefined
                }
              />
            </div>
            <NumberField label="Protein low (g/day)" name="proteinLowGDay" defaultValue={profile.proteinLowGDay} />
            <NumberField label="Protein high (g/day)" name="proteinHighGDay" defaultValue={profile.proteinHighGDay} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              About me
              <InfoTip>
                Written straight into the coach&apos;s briefing — its picture of you is
                built only from this page. Leave it empty for a generic coach.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              name="aboutMe"
              defaultValue={profile.aboutMe}
              rows={5}
              placeholder="Anything you want the coach to know, in your own words. Eating patterns, foods you love or refuse to eat, what's failed before…"
            />
          </CardContent>
        </Card>

        <Button type="submit">Save profile</Button>
      </form>
    </div>
  );
}

function NumberField({ label, name, defaultValue }: { label: string; name: string; defaultValue: number | null }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} inputMode="numeric" defaultValue={defaultValue ?? ""} />
    </div>
  );
}
