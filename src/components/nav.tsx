"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  BookOpen, CalendarDays, MessageCircle, NotebookPen, TrendingUp, User,
} from "lucide-react";

const TABS = [
  { href: "/week", label: "Plan", icon: CalendarDays },
  { href: "/track", label: "Track", icon: NotebookPen },
  { href: "/progress", label: "Progress", icon: TrendingUp },
  { href: "/week/chat", label: "Coach", icon: MessageCircle },
];

const MORE = [
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/profile", label: "Profile", icon: User },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-1 px-4">
        <Link href="/week" className="font-display mr-3 text-lg italic text-primary">
          Prep Coach
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {[...TABS, ...MORE].map((tab) => (
            <NavLink key={tab.href} href={tab.href} label={tab.label} active={isActive(pathname, tab.href)} />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <nav className="flex items-center gap-1 md:hidden">
            {MORE.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-label={tab.label}
                className={cn(
                  "rounded-md p-2 text-muted-foreground hover:text-foreground",
                  isActive(pathname, tab.href) && "text-foreground",
                )}
              >
                <tab.icon className="size-5" />
              </Link>
            ))}
          </nav>
          <button
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "text-primary font-semibold" : "text-muted-foreground",
              )}
            >
              <tab.icon className="size-5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function isActive(pathname: string, href: string): boolean {
  // Exact match beats prefix so Plan doesn't light up on /week/chat. Archive
  // pages (/weeks/[id]) count as Plan — they're the Past-weeks drawer's leaves.
  if (href === "/week") return pathname === "/week" || pathname.startsWith("/weeks");
  // Recipe editing still lives under /cookbook, and /ingest feeds the Library.
  if (href === "/library")
    return pathname.startsWith("/library") || pathname.startsWith("/cookbook") || pathname === "/ingest";
  return pathname.startsWith(href);
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
