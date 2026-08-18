"use client";

/**
 * AuditTimeline — read-only history of what happened (browser.action_event).
 *
 * Content-free by design: actor, action, result, time, and a safe origin — never
 * a page value, keystroke, or credential. Retention is 30 days (D-20), stated in
 * the footer so the user knows how far back this reaches.
 */

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { Cpu, User, Cog } from "lucide-react";
import { CHECKPOINT_RETENTION_DAYS } from "../constants";
import type { ProgressEvent } from "../types";

function actorIcon(actor: ProgressEvent["actor"]) {
  if (actor === "human") return <User className="h-3.5 w-3.5 text-primary" aria-label="Person" />;
  if (actor === "system") return <Cog className="h-3.5 w-3.5 text-muted-foreground" aria-label="System" />;
  return <Cpu className="h-3.5 w-3.5 text-primary" aria-label="Agent" />;
}

const RESULT_TONE: Record<ProgressEvent["resultClass"], string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
  timeout: "text-amber-600 dark:text-amber-400",
  conflict: "text-amber-600 dark:text-amber-400",
  blocked_by_human_control: "text-amber-600 dark:text-amber-400",
  refused_by_policy: "text-amber-600 dark:text-amber-400",
  suppressed: "text-muted-foreground",
  cancelled: "text-muted-foreground",
};

export function AuditTimeline({
  events,
  className,
}: {
  events: ProgressEvent[];
  className?: string;
}) {
  const ordered = [...events].sort((a, b) => b.sequence - a.sequence);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <ScrollArea className="flex-1">
        {ordered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ul className="flex flex-col">
            {ordered.map((e) => (
              <li key={e.id} className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {new Date(e.occurredAt).toLocaleString()}
                </span>
                {actorIcon(e.actor)}
                <Badge variant="outline" className="font-mono font-normal">
                  {e.action}
                </Badge>
                <span className={cn("font-medium", RESULT_TONE[e.resultClass])}>
                  {e.resultClass}
                </span>
                {e.origin ? (
                  <span className="ml-auto truncate text-muted-foreground">
                    {new URL(e.origin).host}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        History and saved restore points are kept for {CHECKPOINT_RETENTION_DAYS} days. The newest
        verified snapshot is always kept, even past that, so a rarely-used browser never loses its
        only restore point.
      </p>
    </div>
  );
}
