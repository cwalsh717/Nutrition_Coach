"use client";

// A quiet ⓘ that holds explanation text so pages don't have to.
// Rule of thumb used across the app: data and status live on the page;
// instructions live in here.

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="More info"
            className="inline-flex align-middle text-muted-foreground/70 hover:text-foreground"
          >
            <Info className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-pretty leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
