/**
 * Deterministic Assists producer for CRM dedup — runs the duplicate scan
 * once per session (per user, all their orgs) when they visit /crm, then
 * turns the results into chips:
 *
 * - identity-key collisions were AUTO-merged by the scan → a receipt chip
 *   ("N records auto-merged") whose action opens /crm/duplicates, where
 *   Recent merges offers the exact undo.
 * - weak-signal suggestions are pending → one chip ("Review N possible
 *   duplicates") opening the merge review queue. Never auto-merged.
 *
 * Producer rules honored (features/assists/FEATURE.md):
 * - dedupe keys + `filterUndecidedKeys` first — a dismissal is durable.
 * - capped: at most TWO chips per sweep (one receipt, one review).
 * - cheapest-first: one deterministic SQL RPC per org, zero model calls.
 * - the action is real: both chips open the review queue where every
 *   decision (merge / dismiss / undo) is one click away.
 *
 * System-of-record: /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import { fetchPendingCandidateCount, runDedupScan } from "./service";

const SOURCE_KEY = "crm.duplicates";

/** `/crm` resolves to this surface (features/surfaces/manifests/crm.manifest). */
export const CRM_ASSIST_SURFACE = "matrx-user/crm";

const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * One sweep per session (the strip gates it). Runs detection for every org,
 * then emits at most two chips. Returns the pending-suggestion count so the
 * caller can also drive the header badge without a second query.
 */
export async function produceCrmDedupAssists(args: {
  userId: string;
  orgIds: string[];
  dispatch: AppDispatch;
}): Promise<number> {
  const { userId, orgIds, dispatch } = args;
  if (orgIds.length === 0) return 0;

  let autoMerged = 0;
  const mergeIds: string[] = [];
  for (const orgId of orgIds) {
    try {
      const result = await runDedupScan(orgId);
      autoMerged += result.auto_merged.length;
      mergeIds.push(...result.auto_merged.map((m) => m.merge_id));
    } catch (e) {
      // A scan needing access the caller lacks must not kill the sweep.
      console.error(`[crm] dedup scan failed for org ${orgId}:`, e);
    }
  }
  const pending = await fetchPendingCandidateCount(orgIds).catch(() => 0);

  const reviewKey = `${SOURCE_KEY}:${userId}`;
  // Receipt chips key on the merge ids — every auto-merge event is its own
  // (loud) receipt, while the review chip stays one durable, dismissable key.
  const autoKey = `${SOURCE_KEY}.auto:${userId}:${mergeIds[0] ?? "none"}`;
  const undecided = new Set(
    await filterUndecidedKeys([reviewKey, autoKey]).catch(() => []),
  );

  if (autoMerged > 0 && undecided.has(autoKey)) {
    await emitAssistTracked(
      userId,
      {
        sourceKey: `${SOURCE_KEY}.auto`,
        title: `${autoMerged} duplicate record${autoMerged === 1 ? "" : "s"} auto-merged`,
        body: `${autoMerged} record${autoMerged === 1 ? "" : "s"} sharing a verified identity email or phone ${autoMerged === 1 ? "was" : "were"} merged automatically. Nothing was deleted — open the review queue to see exactly what moved and undo any merge with one click.`,
        action: {
          kind: "navigate",
          href: "/crm/duplicates",
          label: "Review merges",
          confirm: "Opens the CRM duplicates page, where Recent merges lists each one with an exact undo.",
          receipt: "Opened the CRM duplicates review queue.",
        },
        surfaceName: CRM_ASSIST_SURFACE,
        dedupeKey: autoKey,
        expiresAt: new Date(Date.now() + EXPIRES_MS).toISOString(),
        priority: 7,
      },
      dispatch,
    );
  }

  if (pending > 0 && undecided.has(reviewKey)) {
    await emitAssistTracked(
      userId,
      {
        sourceKey: SOURCE_KEY,
        title: `Review ${pending} possible duplicate${pending === 1 ? "" : "s"}`,
        body: `${pending} pair${pending === 1 ? "" : "s"} of records look like the same person or company — shared emails or phones, matching names, or matching domains. Nothing merges until you decide: each pair shows both records side by side with exactly what a merge would move.`,
        action: {
          kind: "navigate",
          href: "/crm/duplicates",
          label: "Review duplicates",
          confirm: "Opens the CRM duplicates page. Reviewing changes nothing — merging always asks first.",
          receipt: "Opened the CRM duplicates review queue.",
        },
        surfaceName: CRM_ASSIST_SURFACE,
        dedupeKey: reviewKey,
        expiresAt: new Date(Date.now() + EXPIRES_MS).toISOString(),
        priority: 5,
      },
      dispatch,
    );
  }

  return pending;
}
