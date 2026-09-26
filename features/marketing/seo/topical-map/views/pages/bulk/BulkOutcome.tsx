"use client";

// features/marketing/seo/topical-map/views/pages/bulk/BulkOutcome.tsx
//
// WHAT THE WRITE ACTUALLY DID — three numbers, none of them folded into
// another, and every kept and failed row openable.
//
// KEPT IS NEVER COUNTED AS FAILED AND NEVER HIDDEN. A page an earlier decision
// holds was deliberately left alone by `seo.set_page_intents`; hiding that
// would tell the person their 200-page redirect landed on 200 pages when it
// landed on 197, and calling it a failure would invite them to overturn a
// colleague's decision they never saw.
//
// A clean result (nothing kept, nothing failed) clears itself — there is
// nothing left to read. A result carrying kept or failed rows STAYS until it is
// dismissed: a sentence that disappears on a timer takes the only copy of a
// verbatim refusal with it.

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";

import type { SetPageIntentsOutcome } from "../seams";
import { keptExistingSentence, setPageIntentsOutcomeLine } from "./setPageIntentsOutcome";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** How long a result with nothing to read stays up. A dwell time, not a taste. */
const CLEAN_OUTCOME_DWELL_MS = 6000;

export interface BulkOutcomeProps {
  outcome: SetPageIntentsOutcome;
  /** The same sentence the confirmation showed — or would have, when the knob says never. */
  sentence: string;
  onDismiss: () => void;
}

export function BulkOutcome({ outcome, sentence, onDismiss }: BulkOutcomeProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = outcome.keptRows.length > 0 || outcome.failedRows.length > 0;

  useEffect(() => {
    if (hasDetail) return;
    const timer = setTimeout(onDismiss, CLEAN_OUTCOME_DWELL_MS);
    return () => clearTimeout(timer);
  }, [hasDetail, onDismiss]);

  return (
    <div
      role="status"
      className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-card px-2 py-1"
    >
      <div className="flex items-center gap-2">
        {hasDetail ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1 text-xs"
            aria-expanded={expanded}
            onClick={() => setExpanded((previous) => !previous)}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            {setPageIntentsOutcomeLine(outcome)}
          </Button>
        ) : (
          <span className="text-xs text-foreground">
            {setPageIntentsOutcomeLine(outcome)}
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1"
          aria-label="Dismiss this result"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{sentence}</p>
      {expanded ? (
        <div className="flex flex-col gap-2 border-t border-border pt-1">
          {outcome.keptRows.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Kept — a person already decided this page
              </p>
              <ul className="flex flex-col gap-0.5">
                {outcome.keptRows.map((row) => (
                  <li key={row.page_id} className="flex items-center gap-1.5 text-xs">
                    <EntityRef
                      token="web_page"
                      id={row.page_id}
                      name={row.url ?? null}
                      openInNewTab
                    />
                    <span className="text-muted-foreground">
                      {keptExistingSentence(row)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {outcome.failedRows.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-destructive">
                Failed
                <ErrorAlchemyMenu />
              </p>
              <ul className="flex flex-col gap-0.5">
                {outcome.failedRows.map((row, index) => (
                  <li
                    key={`${row.page_id ?? row.url ?? "row"}:${index}`}
                    className="flex flex-wrap items-center gap-1.5 text-xs"
                  >
                    {row.page_id ? (
                      <EntityRef
                        token="web_page"
                        id={row.page_id}
                        name={row.url ?? null}
                        openInNewTab
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        {row.url ?? "a page the result did not name"}
                      </span>
                    )}
                    {/* SQLERRM, unaltered: these refusals are written for the
                        person making the change. */}
                    <span className="whitespace-pre-wrap text-destructive">
                      {row.error}
                      <ErrorAlchemyMenu error={row.error} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
