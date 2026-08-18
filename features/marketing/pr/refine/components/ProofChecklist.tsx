"use client";

/**
 * `proof_required` + `missing_evidence` — the honest heart of the product.
 *
 * The design rule from the brief: an angle that isn't provable yet is not a
 * failure, it is a to-do. So this reads as PROGRESS, not as an error —
 * completed proofs are ticked and green, outstanding ones are neutral to-do
 * rows with an owner and a reason, and the whole thing is fronted by "4 of 6
 * proofs in hand" rather than "2 errors". Nothing here is red. Red is reserved
 * for `contradictions`, which is the only field on the table that means
 * something is actually WRONG.
 *
 * Every outstanding item ships with its one-click fix (THE DOOR LAW's third
 * corollary): a copy pair that produces the exact request to send to whoever
 * owns the gap, human-readable or as an agent payload.
 */

import { Check, CircleDashed, TriangleAlert, UserRound } from "lucide-react";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import { proofProgress } from "@/features/marketing/pr/refine/scoring";
import {
  jsonRecords,
  jsonText,
  readProofItems,
  type ProofItem,
  type StoryAngle,
} from "@/features/marketing/pr/refine/types";

/** The dense, always-visible summary that lives in the collapsed row. */
export function ProofPill({
  angle,
  className,
}: {
  angle: StoryAngle;
  className?: string;
}) {
  const progress = proofProgress(angle);
  if (progress.required === 0 && progress.missing === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[11px] text-muted-foreground",
          className,
        )}
      >
        <Check className="h-3 w-3 text-emerald-500" aria-hidden />
        No proof outstanding
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      title={`${progress.inHand} of ${progress.required} proofs in hand`}
    >
      <span className="flex h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            "h-full rounded-full",
            progress.complete ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${progress.percent}%` }}
        />
      </span>
      <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        {progress.inHand}/{progress.required} proofs
      </span>
    </span>
  );
}

function itemAsk(angle: StoryAngle, item: ProofItem): string {
  return [
    `Evidence needed for a press angle: "${angle.headline}"`,
    "",
    `What we need: ${item.label}`,
    item.detail ? `Why it matters: ${item.detail}` : null,
    item.owner ? `Best source: ${item.owner}` : null,
    "",
    "Once we have this, the angle can go to a journalist.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function ProofChecklist({ angle }: { angle: StoryAngle }) {
  const required = readProofItems(angle.proof_required, "req");
  const missing = readProofItems(angle.missing_evidence, "miss");
  const missingLabels = new Set(missing.map((item) => item.label));
  const inHand = required.filter((item) => !missingLabels.has(item.label));
  const progress = proofProgress(angle);
  const contradictions = jsonRecords(angle.contradictions);

  const hasAnything =
    required.length > 0 || missing.length > 0 || contradictions.length > 0;
  if (!hasAnything) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No evidence requirements were recorded for this angle. That usually
        means the analysis has not run against your data yet.
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold text-foreground">
            {progress.required === 0
              ? `${missing.length} thing${missing.length === 1 ? "" : "s"} to gather`
              : `${progress.inHand} of ${progress.required} proofs in hand`}
          </p>
          {progress.complete ? (
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Provable today
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {missing.length} to go
            </span>
          )}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              progress.complete ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      <ul className="space-y-1.5">
        {missing.map((item) => (
          <li
            key={item.key}
            className="group/proof flex min-w-0 items-start gap-2 rounded-md border border-border bg-background px-2 py-1.5"
          >
            <CircleDashed
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-foreground">
                {item.label}
              </p>
              {item.detail ? (
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {item.detail}
                </p>
              ) : null}
              {item.owner ? (
                <span className="mt-1 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <UserRound className="h-2.5 w-2.5" aria-hidden />
                  {item.owner}
                </span>
              ) : null}
            </div>
            <span className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/proof:opacity-100">
              <CopyButtons
                size="xs"
                label={`Request: ${item.label}`}
                human={() => itemAsk(angle, item)}
                agent={() => ({
                  kind: "press-evidence-request",
                  location: "AI Matrx — Marketing — Press Room",
                  description: `The outstanding evidence "${item.label}" blocking the press angle "${angle.headline}".`,
                  data: {
                    angle_id: angle.id,
                    angle_key: angle.angle_key,
                    headline: angle.headline,
                    requirement: item.label,
                    why: item.detail,
                    owner: item.owner,
                  },
                  summary: itemAsk(angle, item),
                  attributes: { angle_key: angle.angle_key },
                })}
              />
            </span>
          </li>
        ))}
        {inHand.map((item) => (
          <li
            key={item.key}
            className="flex min-w-0 items-start gap-2 px-2 py-1"
          >
            <Check
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
              aria-hidden
            />
            <p className="min-w-0 text-[11px] text-muted-foreground">
              {item.label}
            </p>
          </li>
        ))}
      </ul>

      {contradictions.length > 0 ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            {contradictions.length} contradiction
            {contradictions.length === 1 ? "" : "s"} found in your own data
          </p>
          <ul className="mt-1 space-y-0.5">
            {contradictions.map((record, index) => (
              <li
                key={`contradiction-${index}`}
                className="text-[11px] leading-4 text-foreground"
              >
                {jsonText(record, "label", "claim", "detail", "note") ??
                  "Unlabelled contradiction"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
