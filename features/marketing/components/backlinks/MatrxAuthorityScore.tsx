"use client";

/**
 * The ONE rendering of the Matrx Authority Score — the compact table cell and
 * the opened-up breakdown (every component, what it contributed, what could
 * not be measured). Shared by every prospecting method (competitor link gap,
 * SERP prospecting): the score is OUR metric, and the one thing that makes it
 * trustworthy is that every surface shows the same parts the same way.
 *
 * THE UNMEASURED RULE lives here too: a NULL score renders "Not measured" —
 * never 0, never a bare dash — via the pure helpers in `lib/link-gap`.
 */

import { Badge } from "@/components/ui/badge";
import {
  AUTHORITY_EXPLAINER,
  AUTHORITY_TONE_CLASS,
  authorityTone,
  parseMatrxAuthority,
  UNMEASURED_LABEL,
} from "@/features/marketing/components/backlinks/lib/link-gap";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database.types";

/** The compact score cell a triage table renders. */
export function AuthorityScoreCell({
  score,
  reason,
}: {
  score: number | null;
  reason: string | null;
}) {
  const tone = authorityTone(score);
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        AUTHORITY_TONE_CLASS[tone],
      )}
      title={reason ?? AUTHORITY_EXPLAINER}
    >
      {score === null ? UNMEASURED_LABEL : score}
    </span>
  );
}

/** The score, opened up: every component, what it added, and what is missing. */
export function AuthorityBreakdown({
  score,
  reason,
  metadata,
}: {
  score: number | null;
  reason: string | null;
  /** The row's `metadata` column — `metadata.matrx_authority` is read here. */
  metadata: Json | null;
}) {
  const authority = parseMatrxAuthority(metadata);
  const tone = authorityTone(score);
  return (
    <section className="rounded-md border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <span className="text-xs font-semibold text-foreground">
          Matrx Authority Score
        </span>
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-base font-semibold tabular-nums",
              AUTHORITY_TONE_CLASS[tone],
            )}
          >
            {score === null ? UNMEASURED_LABEL : score}
          </span>
          {authority.band ? (
            <Badge variant="secondary" className="text-[11px]">
              {authority.band}
            </Badge>
          ) : null}
          {authority.confidence ? (
            <span className="text-[11px] text-muted-foreground">
              {authority.confidence} confidence
            </span>
          ) : null}
        </span>
      </header>
      {authority.why || reason ? (
        <p className="border-b border-border px-2.5 py-1.5 text-xs leading-5 text-foreground">
          {authority.why ?? reason}
        </p>
      ) : null}
      {authority.components.length ? (
        <ul className="divide-y divide-border">
          {authority.components.map((component) => (
            <li
              key={component.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-2.5 py-1.5"
            >
              <span className="min-w-0 text-xs font-medium text-foreground">
                {component.label}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {component.raw === null ? UNMEASURED_LABEL : component.raw}
                {component.contribution === null
                  ? null
                  : ` · ${component.contribution > 0 ? "+" : ""}${component.contribution}`}
              </span>
              {component.why ? (
                <span className="col-span-2 text-[11px] leading-4 text-muted-foreground">
                  {component.why}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          We have not scored this site yet — that is why it reads{" "}
          {UNMEASURED_LABEL.toLowerCase()} rather than zero. Run the comparison
          again to measure it.
        </p>
      )}
      {authority.missing.length ? (
        <p className="border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Not measured: {authority.missing.join(", ")}
        </p>
      ) : null}
    </section>
  );
}
