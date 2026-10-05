/**
 * THE ONE SURFACE A COLUMN'S VALIDATION REFUSAL REACHES A PERSON THROUGH.
 *
 * Built on `RefusalNotice` — the same component the unified grid and FIX-15's
 * store refusals use — so a refusal made in the browser and a refusal made by the
 * database are the SAME object on screen: same heading, same shape, same place.
 * The person has no way of knowing which half of the system said no, and no
 * reason to care.
 *
 * THREE THINGS IT IS NOT, each of them something one of the five surfaces did
 * before this file existed:
 *
 *   · NOT A TOAST. A refusal on a timer is a refusal nobody read, and the value
 *     it is about is still in front of the person. It sits until it is answered.
 *   · NOT A BARE SENTENCE. The row modals printed `verdict.reason` in red and
 *     nothing else — what went wrong with no remedy is a dead end with an
 *     explanation.
 *   · NOT SILENT ABOUT THE RULE. The column's whole rule set is on the notice, in
 *     the author's own words, so the retry is informed rather than a second guess.
 *
 * KEEP EDITING / DISCARD. Where an editor is open holding the typed text —  the
 * grid cell — the notice owns the two doors out, because the text is kept ONLY
 * while the notice is on screen. A surface that holds the text in a form field
 * the person can already see and fix (a row modal) passes neither handler and
 * gets the notice without them.
 */
"use client";

import { RefusalNotice } from "@ai-matrx/records-ui";

import { cn } from "@/lib/utils";
import type { ColumnRuleRefusal } from "../validation-refusal";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function FieldRuleRefusal({
  refusal,
  onKeepEditing,
  onDiscard,
  className,
}: {
  refusal: ColumnRuleRefusal;
  /** Present only where an editor is open holding what was typed. */
  onKeepEditing?: () => void;
  /** Present only where an editor is open holding what was typed. */
  onDiscard?: () => void;
  className?: string;
}) {
  // THE DOORS ARE THE PRIMITIVE'S (records-ui 0.82.0, lane REFUSAL-SWEEP): one
  // component draws Keep editing / Discard for every refusal on the platform, so
  // this file passes the handlers and no longer draws buttons of its own.
  return (
    <RefusalNotice
      error={refusal.error}
      className={cn("text-left", className)}
      onKeepEditing={onKeepEditing}
      onDiscard={onDiscard}
      actions={
        <div
          className="mt-1 space-y-1"
          data-matrx-field-rule-refusal=""
          data-field={refusal.fieldDisplayName}
        >
          {/* THE COLUMN'S OWN RULES, VERBATIM. Rendered here rather than inside
              the message on purpose — see `validation-refusal.ts`: the refusal
              formatter excises anything shaped like a machine identifier, and a
              pattern a dispatcher wrote ("JOB-123") is exactly that shape. This
              slot is the screen's own content and is never filtered. */}
          {refusal.rules.length > 0 ? (
            <p className="opacity-80" data-matrx-column-rules="">
              {refusal.fieldDisplayName} accepts: {refusal.rules.join(" · ")}
              <ErrorAlchemyMenu error={refusal.fieldDisplayName} />
            </p>
          ) : null}
        </div>
      }
    />
  );
}
