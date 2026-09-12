"use client";

/**
 * The confirmation badge — the one drawing of `content_ir.kind_instance
 * .confirmation` anywhere in the app.
 *
 * Two states, both stated plainly. `unconfirmed` is the state an agent-written
 * record is born in, and it is NOT an error or a warning: it means a person has
 * not looked yet. It is drawn as a neutral, legible fact rather than a red
 * alarm, because alarming a reader about the normal case teaches them to ignore
 * the badge.
 */

import { CheckCircle2, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordConfirmation } from "./kind-record-service";

export function RecordConfirmationBadge({
  confirmation,
  className,
}: {
  confirmation: RecordConfirmation;
  className?: string;
}) {
  const confirmed = confirmation === "confirmed";
  const Icon = confirmed ? CheckCircle2 : CircleDashed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        confirmed
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
      title={
        confirmed
          ? "A person has confirmed this record."
          : "Nobody has confirmed this record yet."
      }
    >
      <Icon className="h-3 w-3" aria-hidden />
      {confirmed ? "Confirmed" : "Unconfirmed"}
    </span>
  );
}
