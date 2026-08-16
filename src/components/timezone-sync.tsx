"use client";

// Tells the server which timezone this browser lives in, so "today" rolls at
// the user's midnight — not the server's. A cookie instead of a profile field
// because the right zone is wherever the user is right now; travel just works.

import { useEffect } from "react";

export function TimezoneSync() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) {
      document.cookie = `tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, []);
  return null;
}
