import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listWeeks, resolveWeek, todayIso } from "@/lib/queries";
import { ChatPanel } from "@/components/chat-panel";
import { InfoTip } from "@/components/info-tip";
import { WeekTabs } from "@/components/week-tabs";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const user = await requireUser();
  const { w } = await searchParams;
  const [week, weeks] = await Promise.all([resolveWeek(user.id, w), listWeeks(user.id)]);

  if (!week) {
    return (
      <p className="pt-10 text-center text-muted-foreground">
        No weeks yet — <Link href="/week/new" className="underline">start one</Link> so the
        coach has something to review.
      </p>
    );
  }

  const messages = await db.chatMessage.findMany({
    where: { weekId: week.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      <WeekTabs weeks={weeks} selectedId={week.id} today={await todayIso()} basePath="/week/chat" />
      <h1 className="flex items-center gap-2 text-2xl">
        Coach
        <InfoTip>
          The coach sees what you chose to share on your profile, plus this
          week&apos;s plan, list, and diary. It advises — you make the changes.
        </InfoTip>
      </h1>
      <ChatPanel
        weekId={week.id}
        initialMessages={messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))}
      />
    </div>
  );
}
