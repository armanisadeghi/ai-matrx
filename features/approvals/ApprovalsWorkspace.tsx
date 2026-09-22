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
import AppLink from "@/components/navigation/AppLink";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ApprovalQueue, type ApprovalQueueSummary } from "./ApprovalQueue";
import { APPROVAL_PAGE_SIZE_KNOB } from "./data";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  APPROVALS_EMPTY_BODY,
  APPROVALS_EMPTY_TITLE,
  APPROVALS_EMPTY_TITLE_ELSEWHERE,
} from "./empty-state";
import type {
  ApprovalFocusDetail,
  ApprovalFocusResolution,
} from "./types";
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
  // The SAME row the reader pages by, so the sentence below can never promise a
  // page size the queue did not use. `undefined` is "not answered yet", and the
  // sentence says "this page" rather than inventing a number for it.
  const rawPageSize = useEffectiveKnob(organizationId, userId, APPROVAL_PAGE_SIZE_KNOB);
  const pageSizeWords =
    typeof rawPageSize === "number" ? `the first ${rawPageSize}` : "one page";
  const [summary, setSummary] = useState<ApprovalQueueSummary | null>(null);
  /**
   * The queue's evidence-backed verdict AND THE ID IT IS ABOUT. `null` = not
   * answered yet.
   *
   * 🚨 The pair is stored together and rendered only when the id still matches
   * `focusItemId`. Keeping the verdict alone meant a new `?item=` inherited the
   * previous row's banner — "already decided" over a row that is waiting —
   * until the next read settled (Bugbot MEDIUM, frontend PR 228).
   */
  const [focus, setFocus] = useState<{
    itemId: string;
    resolution: ApprovalFocusResolution;
    detail: ApprovalFocusDetail;
  } | null>(null);
  const current = focus && focusItemId && focus.itemId === focusItemId
    ? focus
    : null;
  const focusResolution = current?.resolution ?? null;
  const detail = current?.detail ?? {};

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

  /**
   * 🚨 EVERY VERDICT SAYS WHAT IS TRUE OF THAT ROW, and the two that used to be
   * folded into "already decided" are the ones that matter most: an approve that
   * FAILED after the claim (the change was never made — round-2 verification
   * § A-iii) and one still running. A site-scoped row gets its own answer and
   * its own door, instead of "past the first page of this list" about a list it
   * was never in (Bugbot round 9 #9).
   */
  const focusMessage =
    focusResolution === "apply_failed"
      ? `You approved that item and THE CHANGE WAS NOT MADE.${
          detail.error ? ` ${detail.error}` : ""
        } Nothing was retried automatically — approve it again to retry, or reject it.`
      : focusResolution === "applied_unconfirmed"
        ? `You approved that item, AI Matrx sent the change to Google, and the answer was lost — so it MAY have been made.${
            detail.error ? ` ${detail.error}` : ""
          } Nothing was retried, and nothing will retry itself: doing it twice would append or create a second copy. Open the file, see what is there, and ask for the change again only if it is missing.`
        : focusResolution === "unknown_state"
          ? `You approved that item and its last attempt is in a state this screen does not know${
              detail.state ? `: \`${detail.state}\`` : ""
            }. This build cannot tell whether the change was made, so nothing here will retry it — refresh after the next release, and open the file in Google if you need to know now.`
        : focusResolution === "applying"
          ? "That item is being applied right now. Reload in a moment to see whether the change was made."
          : focusResolution === "decided"
            ? "The item that link points to has already been decided — it was approved or rejected. Everything still waiting on you is above."
            : focusResolution === "not_in_this_list"
              ? `That item is still waiting on you, but not in this list: ${
                  detail.explain ??
                  "it belongs to a queue this page does not show."
                }`
              : focusResolution === "no_screen"
                ? "That item is still waiting on you and this version of the app has no screen for it — it was filed by a newer part of the system. Nothing was decided; tell us and it will be shown here."
                : focusResolution === "pending_elsewhere"
                  ? `The item that link points to is still waiting on you, but it is not in the list above — this page shows ${pageSizeWords} of each kind, and the rest are reached from each section's own link.`
                  : focusResolution === "not_an_approval"
                    ? "That link does not point at something waiting for your approval — the item it names is a different kind of notice."
                    : focusResolution === "unconfirmed"
                      ? "The item that link points to is not in the list above, and we could not confirm what became of it. Everything still waiting on you is above."
                      : null;

  /** True while the person is holding a link to a row that IS still waiting. */
  const waitingElsewhere =
    focusResolution === "not_in_this_list" ||
    focusResolution === "pending_elsewhere" ||
    focusResolution === "no_screen" ||
    focusResolution === "apply_failed" ||
    focusResolution === "applying";

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
        onFocusResolved={(itemId, resolution, focusDetail) =>
          setFocus({ itemId, resolution, detail: focusDetail ?? {} })
        }
      />
      {/* A link that points at a row nobody can find gets an ANSWER, not a
          silent list the person has to search (THE NO-SILENT-FAILURE LAW) —
          and the answer says exactly as much as the queue could prove. Saying
          "already decided" because a row was not on page one is the screen
          lying (Bugbot MEDIUM #2, 2026-09-17). */}
      {focusItemId && focusMessage ? (
        <p className="mt-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          {focusMessage}
          {/* THE DOOR LAW: the item exists, so the sentence that says it is not
              an approval also says where it IS. */}
          {focusResolution === "not_an_approval" ? (
            <>
              {" "}
              <AppLink
                /* `/assists` reads no `?item=` today — linking one would be a
                   deep link that silently lands nowhere in particular. */
                href="/assists"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Open it with everything else the system flagged for you
              </AppLink>
            </>
          ) : null}
          {/* THE DOOR LAW again: the row lives somewhere, so the sentence that
              says "not in this list" carries the way there. */}
          {focusResolution === "not_in_this_list" && detail.where ? (
            <>
              {" "}
              <AppLink
                href={detail.where.href}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {detail.where.label}
              </AppLink>
            </>
          ) : null}
        </p>
      ) : null}
      {empty ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 className="size-8 text-success" />
          <p className="text-sm font-medium text-foreground">
            {/* 🚨 NEVER "nothing is waiting on you" while the person is holding a
                link to something that IS (Bugbot round 9 #9). */}
            {waitingElsewhere
              ? APPROVALS_EMPTY_TITLE_ELSEWHERE
              : APPROVALS_EMPTY_TITLE}
          </p>
          {/* The copy lives in `./empty-state.ts` so the lane that ships the
              first producer changes it in one place, in the commit that makes
              it true. */}
          <p className="max-w-md text-xs text-muted-foreground">
            {/* The banner above already carries the whole answer and its door;
                the card only has to stop contradicting it. */}
            {waitingElsewhere
              ? "One item you were sent a link to is still waiting on you — the note above says where it is."
              : APPROVALS_EMPTY_BODY}
          </p>
        </div>
      ) : null}
    </div>
  );
}
