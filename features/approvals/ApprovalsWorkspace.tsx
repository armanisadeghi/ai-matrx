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
  // `null` = not answered yet. `false` = the read settled and that row is gone.
  const [focusFound, setFocusFound] = useState<boolean | null>(null);

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
        onFocusResolved={setFocusFound}
      />
      {/* A link that points at a row nobody can find gets an ANSWER, not a
          silent list the person has to search (THE NO-SILENT-FAILURE LAW). */}
      {focusItemId && focusFound === false ? (
        <p className="mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          The item that link points to is not waiting any more — it was most
          likely already approved or rejected. Everything still waiting on you is
          above.
        </p>
      ) : null}
      {empty ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 className="size-8 text-success" />
          <p className="text-sm font-medium text-foreground">
            Nothing is waiting on you
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            When an agent drafts an email, proposes a change to one of your
            spreadsheets, or suggests anything else that needs a person, it
            appears here — and nothing takes effect until you decide.
          </p>
        </div>
      ) : null}
    </div>
  );
}
