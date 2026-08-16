"use client";

// Tells the server which timezone this browser lives in, so "today" rolls at
// the user's midnight — not the server's. A cookie instead of a profile field
// because the right zone is wherever the user is right now; travel just works.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TimezoneSync() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    const had = document.cookie.includes("tz=");
    document.cookie = `tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax`;
    // The first render of a fresh browser happened before this cookie existed,
    // so the server dated it by ITS clock. That used to mean a wrong default
    // tab; now it could freeze a live week a day early. Re-render once.
    if (!had) router.refresh();
  }, [router]);
  return null;
}
