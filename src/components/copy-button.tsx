"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ text }: { text: string }) {
  const [showFallback, setShowFallback] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("List copied — paste it into ShopRite.");
    } catch {
      setShowFallback(true); // older mobile browsers: show a select-all box
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={copy}>Copy for ShopRite</Button>
      {showFallback && (
        <textarea
          readOnly
          value={text}
          rows={10}
          className="w-full rounded-md border p-2 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}
