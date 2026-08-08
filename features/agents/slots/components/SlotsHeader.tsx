"use client";

import { Replace } from "lucide-react";

/** Shell header center content for /agents/slots — single-view route, small
 * identity only (per the core-route-headers doctrine). */
export function SlotsHeader() {
  return (
    <div className="flex w-full items-center gap-2 px-1">
      <Replace className="h-4 w-4 shrink-0 text-muted-foreground" />
      <h1 className="text-sm font-semibold text-foreground">Step Agents</h1>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        Choose which agent runs each system step
      </span>
    </div>
  );
}
