"use client";

/**
 * AgentReviewWriteTargets — the live handlers for the write half of
 * `matrx-admin/agent-review` (the targets its manifest declares).
 *
 * The receiving end of the 360 loop on the Agent Repair Board: an agent bound
 * to this page calls `apply_surface_write`, the writeback seam confirms with
 * the admin (both targets are `ask`), and the value lands here — through the
 * page's OWN write path (`updateReviewQueueRow`, the same service every
 * button on a review card calls) or its own draft buffer. Never raw supabase,
 * never a parallel write.
 *
 * Two rules this file exists to enforce:
 *
 *  1. **Name the row or be refused.** This page shows the whole queue and has
 *     no notion of a selected row, so every target takes a `row_id` that must
 *     match a row currently loaded. A write that names nothing, or names a row
 *     this page isn't showing, throws — the seam turns that into the loud
 *     toast + captured error the agent reads back.
 *
 *  2. **Confirm the entity write actually landed.** `updateReviewQueueRow`
 *     throws on a Postgres error, but an UPDATE filtered away by the
 *     super-admin RLS policy is not an error — it succeeds having changed zero
 *     rows. Reporting that as a save would be a lie, so the triage handler
 *     re-reads the queue through the page's canonical loader and throws unless
 *     the new classification is really there.
 *
 * STATUS is deliberately absent. This queue holds work agents produced;
 * approve/request-changes/archive/restore stay the admin's button presses and
 * are not declared as targets at all. See the manifest's doc comment.
 *
 * Renders nothing. Mount once inside the page's `SurfaceRuntimeProvider`.
 */

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_AGENT_REVIEW_SURFACE_NAME } from "@/features/surfaces/manifests/admin-agent-review.manifest";
import { updateReviewQueueRow } from "@/features/admin/agent-review/service";
import {
  REVIEW_LANES,
  REVIEW_PRIORITIES,
  REVIEW_TOOLS,
  REVIEW_WORKSTREAMS,
  metadataWithReviewTriage,
  parseReviewMetadata,
  reviewTriageSchema,
  suggestReviewTriage,
  type ReviewLane,
  type ReviewPriority,
  type ReviewTool,
  type ReviewTriage,
  type ReviewWorkstream,
} from "@/features/admin/agent-review/triage";
import type { ReviewQueueRow } from "@/features/admin/agent-review/types";

/** Wire value for the `review_feedback_draft` target. */
export interface ReviewFeedbackDraftWrite {
  row_id: string;
  feedback: string;
}

/** Wire value for the `review_triage_classification` target. */
export interface ReviewTriageClassificationWrite {
  row_id: string;
  lane?: ReviewLane;
  priority?: ReviewPriority;
  workstreams?: ReviewWorkstream[];
  required_tools?: ReviewTool[];
}

function asRecord(value: unknown, target: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `${target} expects an object value, e.g. { "row_id": "…", … }.`,
    );
  }
  return value as Record<string, unknown>;
}

/** One member of a vocabulary, checked against the REAL constant. */
function enumValue<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  field: string,
  target: string,
): T {
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    throw new Error(
      `${target}: ${field} must be one of ${allowed.join(" | ")} (got ${JSON.stringify(raw)}).`,
    );
  }
  return raw as T;
}

/** A FULL replacement set drawn from a vocabulary — order-preserving, deduped. */
function enumArray<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  field: string,
  target: string,
  { allowEmpty }: { allowEmpty: boolean },
): T[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      `${target}: ${field} must be an array of ${allowed.join(" | ")}.`,
    );
  }
  if (raw.length === 0 && !allowEmpty) {
    throw new Error(`${target}: ${field} must list at least one value.`);
  }
  const seen = new Set<T>();
  for (const entry of raw) {
    seen.add(enumValue(entry, allowed, `${field}[]`, target));
  }
  return allowed.filter((option) => seen.has(option));
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

export function AgentReviewWriteTargets({
  rows,
  setFeedbackDraft,
  refresh,
}: {
  /** The queue as currently loaded — `null` while the first load is in flight. */
  rows: ReviewQueueRow[] | null;
  /** Stages text into one row's feedback editor (the admin's own buffer). */
  setFeedbackDraft: (rowId: string, feedback: string) => void;
  /** The page's canonical reload; resolves with the rows it just read. */
  refresh: () => Promise<ReviewQueueRow[]>;
}) {
  /**
   * Resolve the addressed row, or refuse loudly. There is no selected row on
   * this page — an agent that doesn't name one is guessing, and a guess here
   * would edit somebody else's review item.
   */
  function requireRow(
    obj: Record<string, unknown>,
    target: string,
  ): ReviewQueueRow {
    const rawId = obj.row_id;
    if (typeof rawId !== "string" || !rawId.trim()) {
      throw new Error(
        `${target}: row_id is required. This page has no selected row — pass the id of the row you mean, from queue_sample.`,
      );
    }
    if (rows === null) {
      throw new Error(
        `${target}: the review queue hasn't finished loading, so no row can be addressed yet.`,
      );
    }
    const rowId = rawId.trim();
    const row = rows.find((entry) => entry.id === rowId);
    if (!row) {
      throw new Error(
        `${target}: no review row with id "${rowId}" is loaded on this page. Use an id from queue_sample.`,
      );
    }
    return row;
  }

  useSurfaceWriteHandlers(ADMIN_AGENT_REVIEW_SURFACE_NAME, {
    review_feedback_draft: (value: unknown) => {
      const target = "review_feedback_draft";
      const obj = asRecord(value, target);
      const row = requireRow(obj, target);
      if (row.status === "archived") {
        throw new Error(
          `${target}: "${row.title}" is archived and has no feedback editor. Restore it to the queue first — that is the admin's call.`,
        );
      }
      const feedback = obj.feedback;
      if (typeof feedback !== "string") {
        throw new Error(
          `${target}: feedback must be a string — the full replacement text for the editor (pass "" to clear it).`,
        );
      }
      // The SAME state the admin's typing updates. Nothing is persisted: the
      // Save feedback / Request changes / Approve buttons still do that.
      setFeedbackDraft(row.id, feedback);
    },

    review_triage_classification: async (value: unknown) => {
      const target = "review_triage_classification";
      const obj = asRecord(value, target);
      const row = requireRow(obj, target);

      const hasField =
        obj.lane !== undefined ||
        obj.priority !== undefined ||
        obj.workstreams !== undefined ||
        obj.required_tools !== undefined;
      if (!hasField) {
        throw new Error(
          `${target}: provide at least one of lane, priority, workstreams, required_tools.`,
        );
      }

      // Base = what the row already says. For a row whose triage is missing or
      // invalid there is nothing to patch, so fall back to the page's own
      // deterministic suggestion — the exact classification its "Apply
      // suggested triage" button would write — and let the agent's fields
      // override it.
      const parsedMetadata = parseReviewMetadata(row.metadata);
      const base: ReviewTriage =
        parsedMetadata.state === "ready"
          ? parsedMetadata.triage
          : suggestReviewTriage(row);

      const next: ReviewTriage = {
        ...base,
        ...(obj.lane !== undefined
          ? { lane: enumValue(obj.lane, REVIEW_LANES, "lane", target) }
          : {}),
        ...(obj.priority !== undefined
          ? {
              priority: enumValue(
                obj.priority,
                REVIEW_PRIORITIES,
                "priority",
                target,
              ),
            }
          : {}),
        ...(obj.workstreams !== undefined
          ? {
              workstreams: enumArray(
                obj.workstreams,
                REVIEW_WORKSTREAMS,
                "workstreams",
                target,
                { allowEmpty: true },
              ),
            }
          : {}),
        ...(obj.required_tools !== undefined
          ? {
              required_tools: enumArray(
                obj.required_tools,
                REVIEW_TOOLS,
                "required_tools",
                target,
                { allowEmpty: false },
              ),
            }
          : {}),
        // Claim state and verification are coordination owned by the
        // agent-review-queue claim protocol, never re-authored from this page.
        assignment: base.assignment,
        verification: base.verification,
      };

      // The canonical contract, not a hand-rolled shape check.
      const validated = reviewTriageSchema.safeParse(next);
      if (!validated.success) {
        throw new Error(
          `${target}: the resulting triage is invalid — ${validated.error.issues
            .map((issue) => `${issue.path.join(".") || "triage"}: ${issue.message}`)
            .join("; ")}`,
        );
      }

      // PATCH the versioned envelope (spreads the stored metadata and replaces
      // only `triage`) — the same helper the page's own triage button uses.
      const nextMetadata = metadataWithReviewTriage(
        row.metadata,
        validated.data,
      );
      await updateReviewQueueRow(row.id, { metadata: nextMetadata });

      // A super-admin RLS policy filters an UPDATE to zero rows WITHOUT an
      // error, so "no throw" is not proof of a save. Re-read and verify.
      const reloaded = await refresh();
      const saved = reloaded.find((entry) => entry.id === row.id);
      if (!saved) {
        throw new Error(
          `${target}: saved, but "${row.title}" was not in the re-read queue, so the change could not be confirmed.`,
        );
      }
      const savedMetadata = parseReviewMetadata(saved.metadata);
      const landed =
        savedMetadata.state === "ready" &&
        savedMetadata.triage.lane === validated.data.lane &&
        savedMetadata.triage.priority === validated.data.priority &&
        sameSet(
          savedMetadata.triage.workstreams,
          validated.data.workstreams,
        ) &&
        sameSet(
          savedMetadata.triage.required_tools,
          validated.data.required_tools,
        );
      if (!landed) {
        throw new Error(
          `${target}: the update reported success but "${row.title}" still shows its previous triage after a re-read — nothing was saved (a row-level security policy can filter an update to zero rows without erroring).`,
        );
      }
    },
  });

  return null;
}
