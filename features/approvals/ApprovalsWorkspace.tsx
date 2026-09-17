"use client";

/**
 * THE approvals surface — everything waiting on this person, in one place.
 *
 * ONE component, mounted by both hosts: the `/approvals` route and the
 * approvals window panel (`./windows/ApprovalsWindow.tsx`). A window WRAPS the
 * canonical component; a bespoke panel body would be a second renderer that
 * drifts from the page (`features/window-panels/FEATURE.md` § A PANEL WRAPS THE
 * CANONICAL COMPONENT).
 *
 * It mounts THE queue (`../ApprovalQueue`) with THE registry and no `kinds`
 * filter, so every kind any lane ever registers appears here without this file
 * changing.
 */

import { CheckCircle2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ApprovalQueue, type ApprovalQueueSummary } from "./ApprovalQueue";
import { APPROVAL_PAGE_SIZE } from "./data";
import { APPROVALS_EMPTY_BODY, APPROVALS_EMPTY_TITLE } from "./empty-state";
import type { ApprovalFocusResolution } from "./types";
import { useState } from "react";

export function ApprovalsWorkspace({
  focusItemId,
  className,
}: {
  /**
   * The row a link asked for — `/approvals?item=<id>`, which is where an
   * assist chip and every deep link land. The route reads it from
   * `searchParams` and hands it down; the window has no URL and passes none.
   */
  focusItemId?: string | null;
  className?: string;
}) {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const [summary, setSummary] = useState<ApprovalQueueSummary | null>(null);
  // `null` = not answered yet; the rest are the queue's evidence-backed
  // verdicts on the row a link named.
  const [focusResolution, setFocusResolution] =
    useState<ApprovalFocusResolution | null>(null);

  if (!userId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          Sign in to see what is waiting on you
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Approvals are addressed to a person — there is nothing to show without
          knowing who you are.
        </p>
      </div>
    );
  }

  const focusMessage =
    focusResolution === "decided"
      ? "The item that link points to has already been decided — it was approved or rejected. Everything still waiting on you is above."
      : focusResolution === "pending_elsewhere"
        ? `The item that link points to is still waiting on you, but it is not in the list above — this page shows the first ${APPROVAL_PAGE_SIZE} of each kind, and the rest are reached from each section's own link.`
        : focusResolution === "unconfirmed"
          ? "The item that link points to is not in the list above, and we could not confirm what became of it. Everything still waiting on you is above."
          : null;

  const settled = summary !== null && !summary.loading;
  const empty = settled && summary.count === 0 && summary.errors === 0;

  return (
    <div className={className}>
      <ApprovalQueue
        scope={{ key: userId, organizationId, userId }}
        title="Waiting on your approval"
        defaultExpanded
        // The one place that must render even when it is empty: "nothing is
        // waiting on you" is the answer a person came here for.
        hideWhenEmpty={false}
        onSummary={(_scopeKey, next) => setSummary(next)}
        focusItemId={focusItemId}
        onFocusResolved={setFocusResolution}
      />
      {/* A link that points at a row nobody can find gets an ANSWER, not a
          silent list the person has to search (THE NO-SILENT-FAILURE LAW) —
          and the answer says exactly as much as the queue could prove. Saying
          "already decided" because a row was not on page one is the screen
          lying (Bugbot MEDIUM #2, 2026-09-17). */}
      {focusItemId && focusMessage ? (
        <p className="mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          {focusMessage}
        </p>
      ) : null}
      {empty ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 className="size-8 text-success" />
          <p className="text-sm font-medium text-foreground">
            {APPROVALS_EMPTY_TITLE}
          </p>
          {/* The copy lives in `./empty-state.ts` so the lane that ships the
              first producer changes it in one place, in the commit that makes
              it true. */}
          <p className="max-w-md text-xs text-muted-foreground">
            {APPROVALS_EMPTY_BODY}
          </p>
        </div>
      ) : null}
    </div>
  );
}
