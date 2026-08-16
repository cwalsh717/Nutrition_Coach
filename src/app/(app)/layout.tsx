import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { BottomTabs, TopNav } from "@/components/nav";

// Everything inside (app) requires a valid session AND a completed onboarding.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  if (!profile?.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-24 md:pb-8">{children}</main>
      <BottomTabs />
    </div>
  );
}
