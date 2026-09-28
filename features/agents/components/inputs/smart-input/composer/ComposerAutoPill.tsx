"use client";

/**
 * Auto / Manual (brief §13). Today every run is Auto — no approval gate exists
 * on the client or the server — so the pill says exactly that and offers only
 * that. "Manual" (ask before new tools or new sites) appears here the day the
 * server can honour it; a choice the platform cannot keep is never shown
 * (brief Q5: "hidden, not faked").
 */

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { ComposerMenuRow } from "./ComposerMenu";
import { composerPillClass } from "./ComposerAgentPill";
import type { ComposerSize } from "./composer-types";

export function ComposerAutoPill({ size, menuSide }: { size: ComposerSize; menuSide: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(composerPillClass(size, open), "shrink-0 whitespace-nowrap")} aria-label="Run mode: Auto">
          <span className="font-medium text-foreground">Auto</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — one described row */
        side={menuSide}
        align="end"
        sideOffset={8}
        className="w-72 p-1"
      >
        <ComposerMenuRow label="Auto" description="Runs without asking." checked onClick={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
