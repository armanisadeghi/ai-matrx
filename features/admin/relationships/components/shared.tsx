"use client";

// features/admin/relationships/components/shared.tsx
//
// Small presentational atoms shared across the Relationships hub tabs
// (Overview, Rules, drift panel). Pure data helpers live in ../utils.ts.

import { MoveLeft, MoveRight } from "lucide-react";
import type { PermissionLevel } from "../types";

/** Direction between content and container, encoded structurally (no prose). */
export function DirectionGlyph({ side }: { side: string }) {
  if (side === "target") {
    return (
      <MoveRight
        className="mx-auto h-4 w-4 text-primary"
        aria-label="content → container (convention)"
      />
    );
  }
  if (side === "source") {
    return (
      <MoveLeft
        className="mx-auto h-4 w-4 text-amber-600 dark:text-amber-500"
        aria-label="container ← content (against convention)"
      />
    );
  }
  return (
    <span
      className="mx-auto block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
      aria-label="related, conveys nothing"
    />
  );
}

/** Conveyance-ceiling pill with a level-appropriate tone. */
export function ConveyPill({ level }: { level: PermissionLevel }) {
  const tone =
    level === "admin"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-500"
      : level === "viewer"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400"
        : "border-primary/40 bg-primary/10 text-primary";
  return (
    <span
      className={`inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {level}
    </span>
  );
}

export function StatusTile({
  label: tileLabel,
  value,
  accent = false,
  tone,
}: {
  label: string;
  value: number;
  accent?: boolean;
  tone?: "ok" | "warn" | "danger";
}) {
  const valueTone =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : accent
          ? "text-primary"
          : "";
  return (
    <div className="flex items-baseline gap-2 rounded-md border border-border bg-card px-3 py-1.5">
      <span className={`text-lg font-semibold tabular-nums ${valueTone}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{tileLabel}</span>
    </div>
  );
}
