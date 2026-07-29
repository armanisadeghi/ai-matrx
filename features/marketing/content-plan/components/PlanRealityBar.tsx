"use client";

/**
 * The plan-vs-reality strip — shown after a Reality check runs (header
 * button). One line of measured truth: how many planned pages are LIVE on
 * the real site, how many are still ghosts (planned, nothing crawled), and
 * how many live URLs the plan doesn't know about (orphans — the list opens
 * in a sheet). Numbers come from the server report verbatim; the tree shows
 * a per-node live badge from the same report.
 */
import { useState } from "react";
import { Radar, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { RealityReport } from "../hooks/usePlanReality";

/** Best-effort display line for an orphan/ghost record (server sends
 * loosely-shaped rows — prefer the meaningful keys, fall back to values). */
function recordLine(record: Record<string, string>): string {
  return (
    record.url ??
    record.route ??
    record.path ??
    record.title ??
    Object.values(record).filter(Boolean).slice(0, 2).join(" — ")
  );
}

export function PlanRealityBar({
  report,
  onDismiss,
}: {
  report: RealityReport;
  onDismiss: () => void;
}) {
  const [orphansOpen, setOrphansOpen] = useState(false);
  const matched = report.matched?.length ?? 0;
  const ghosts = report.ghosts?.length ?? 0;
  const orphans = report.orphans ?? [];

  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-xs">
      <Radar className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate text-foreground">
        Reality check:{" "}
        <span className="font-medium">{matched} planned pages are live</span>
        {" · "}
        {ghosts} planned but not on the site yet
        {orphans.length > 0 ? (
          <>
            {" · "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline"
              onClick={() => setOrphansOpen(true)}
            >
              {orphans.length} live URL{orphans.length === 1 ? "" : "s"} the
              plan doesn&rsquo;t know
            </button>
          </>
        ) : null}
      </span>
      <span className="hidden shrink-0 text-muted-foreground sm:inline">
        Live pages carry a dot in the tree
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 shrink-0 p-0"
        aria-label="Dismiss reality overlay"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      <Sheet open={orphansOpen} onOpenChange={setOrphansOpen}>
        <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px]">
          <SheetHeader>
            <SheetTitle>Live URLs the plan doesn&rsquo;t know</SheetTitle>
          </SheetHeader>
          <p className="px-4 text-xs text-muted-foreground">
            Crawled pages on the real site with no matching planned route.
            Adopt them into the plan (create the node at that route) or let
            a future disposition pass retire/redirect them.
          </p>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-2">
            {orphans.map((record, index) => (
              <li
                key={index}
                className="break-all rounded border border-border px-2 py-1.5 font-mono text-xs text-foreground"
              >
                {recordLine(record)}
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
