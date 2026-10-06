"use client";

// features/crm/pre-send-check/RecipientFitBadge.tsx
//
// One recipient's fit verdict, and whether it was checked against THIS pitch.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fitLabel, fitTone, type RecipientFit } from "./service";

const TONE: Record<ReturnType<typeof fitTone>, string> = {
  good: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  mid: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  bad: "border-destructive/40 text-destructive",
  none: "text-muted-foreground",
};

export function RecipientFitBadge({
  fit,
}: {
  fit: Pick<RecipientFit, "verdict" | "basis" | "note">;
}) {
  const stale = fit.basis === "other_pitch";
  const failed = fit.basis === "failed";
  return (
    <Badge
      variant="outline"
      className={cn(TONE[fitTone(fit.verdict)], "whitespace-nowrap")}
      title={fit.note ?? undefined}
      data-testid="recipient-fit-badge"
      data-verdict={fit.verdict ?? "none"}
    >
      {failed ? "Fit check failed" : fitLabel(fit.verdict)}
      {stale && " · earlier pitch"}
    </Badge>
  );
}
