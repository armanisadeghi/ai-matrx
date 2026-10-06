"use client";

import { StatusDot } from "@ai-matrx/design-system";
import type { StatusTone } from "@ai-matrx/design-system";

import { cn } from "@/lib/utils";

import type { ConsolePill } from "./connection";

const TONE: Record<ConsolePill, StatusTone> = { live: "success", reconnecting: "warning", offline: "neutral", refused: "danger" };

/** Live / Reconnecting… / Offline — the device console's one connection fact, in the header. */
export function StatusPill({ pill, label, className }: { pill: ConsolePill; label: string; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium",
        pill === "live" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        pill === "reconnecting" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        pill === "offline" && "border-border bg-muted text-muted-foreground",
        pill === "refused" && "border-destructive/30 bg-destructive/10 text-destructive-ink",
        className,
      )}
    >
      <StatusDot tone={TONE[pill]} className={cn(pill === "reconnecting" && "animate-pulse")} />
      {label}
    </span>
  );
}
