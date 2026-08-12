/**
 * Finding lifecycle writes — the user half of `web.finding`.
 *
 * The analyzer owns DETECTION (open / refresh / reopen / resolve — see aidream
 * `web_crawl/analysis_write.py::reconcile_findings`, which explicitly never
 * touches suppression). The USER owns JUDGEMENT: "I've seen this", "I fixed
 * this", "this is intentional, stop telling me", "no, it's back". Those verbs
 * live here.
 *
 * Direct to Supabase under the caller's JWT (RLS is the authorization
 * layer) — a lifecycle marker is pure UI↔DB and must never take a hop
 * through the Python server (CLAUDE.md § Data flow).
 *
 * Why this exists: every finding needs an honest exit. Some checks
 * (`meta_robots_conflicts` on a deliberately hidden page, `broken_page_4xx`
 * on a page you retired on purpose) are CORRECT behaviour for this site, and
 * a register that cannot record that is a register the user stops reading.
 *
 * ## The vocabulary is the schema's, and it is closed
 *
 * `finding_status_valid` allows exactly `open | acknowledged | resolved |
 * reopened`, and `finding_resolution_valid` makes `resolved` and a non-null
 * `resolved_at` inseparable — which is why every transition here writes
 * `resolved_at` explicitly rather than leaving it to drift. Nothing in this
 * file may invent a fifth status or a parallel "dismissed" flag; suppression
 * (`suppressed` + `suppressed_reason`) is the only other axis and it is
 * ORTHOGONAL to status, never a substitute for one.
 *
 * ## What survives a re-analysis, and why
 *
 * A finding row is the durable identity of `(site, subject, item)`. The
 * reconciler refreshes the row it already has and REOPENS the row it resolved
 * — it never opens a second row for a condition that came back — so a
 * suppression, its reason, and `first_detected_at` all survive re-crawl and
 * re-analysis. Marking something resolved is therefore a claim the server can
 * contradict: if it is still broken, the next analysis brings that same row
 * back as `reopened`.
 */

import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import type { MarketingFinding } from "@/features/marketing/data/analysis-types";
import { assertFound } from "@/features/marketing/data/service";

const FINDING_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, severity, status, suppressed, suppressed_reason, first_result_id, last_result_id, first_detected_at, last_detected_at, resolved_at";

/** Statuses that mean "this is live" — everything except `resolved`. */
export const LIVE_FINDING_STATUSES = [
  "open",
  "acknowledged",
  "reopened",
] as const;

interface FindingPatch {
  status?: string;
  resolved_at?: string | null;
  suppressed?: boolean;
  suppressed_reason?: string | null;
}

/**
 * `finding_open_uniq` allows only ONE non-resolved row per
 * (site, subject_type, subject_id, item_id). Reopening a row the analyzer has
 * since replaced trips it — a real state conflict, so it gets a sentence a
 * non-technical user can act on instead of a raw Postgres code.
 */
function translateFindingWriteError(error: PostgrestError): Error {
  if (error.code === "23505") {
    return new Error(
      "A newer finding for this check is already open — reload the register and act on that one.",
    );
  }
  return new Error(error.message);
}

async function patchFinding(
  siteId: string,
  findingId: string,
  patch: FindingPatch,
): Promise<MarketingFinding> {
  const response = await (await authenticatedWebDb(supabase))
    .from("finding")
    .update(patch)
    .eq("site_id", siteId)
    .eq("id", findingId)
    .is("deleted_at", null)
    .select(FINDING_COLUMNS)
    .maybeSingle();
  if (response.error) throw translateFindingWriteError(response.error);
  return assertFound(
    response.data,
    response.error,
    "finding",
    findingId,
    "web_finding",
  );
}

/**
 * The same patch across many rows, in ONE statement — the register is only
 * useful if a user can clear noise fast, and N sequential round trips is how
 * a "suppress these 40" turns into a spinner the user abandons.
 *
 * Returns the rows actually written: RLS filters this to the sites the caller
 * can edit, so a count lower than `findingIds.length` is real information and
 * the caller reports it rather than claiming everything landed.
 */
async function patchFindings(
  siteId: string,
  findingIds: string[],
  patch: FindingPatch,
): Promise<MarketingFinding[]> {
  if (findingIds.length === 0) return [];
  const response = await (await authenticatedWebDb(supabase))
    .from("finding")
    .update(patch)
    .eq("site_id", siteId)
    .in("id", findingIds)
    .is("deleted_at", null)
    .select(FINDING_COLUMNS);
  if (response.error) throw translateFindingWriteError(response.error);
  return response.data ?? [];
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error("Say why this is intentional — the reason is the record.");
  }
  return trimmed;
}

// ── Suppression (orthogonal to status) ──────────────────────────────────────

/**
 * "This is intentional — stop flagging it." Suppression is durable user
 * state: the analyzer keeps re-detecting the condition, and keeps the
 * finding out of the priority queue, which reads only unsuppressed rows.
 */
export function suppressFinding(
  siteId: string,
  findingId: string,
  reason: string,
): Promise<MarketingFinding> {
  return patchFinding(siteId, findingId, {
    suppressed: true,
    suppressed_reason: requireReason(reason),
  });
}

/** Undo a suppression — the finding rejoins the queue at its real severity. */
export function unsuppressFinding(
  siteId: string,
  findingId: string,
): Promise<MarketingFinding> {
  return patchFinding(siteId, findingId, {
    suppressed: false,
    suppressed_reason: null,
  });
}

// ── Status transitions ──────────────────────────────────────────────────────

/**
 * "I've seen this and I'm on it." Acknowledged findings stay LIVE (aidream
 * treats `acknowledged` as a non-resolved status and keeps refreshing them) —
 * acknowledging is a note to the next person, not a fix.
 */
export function acknowledgeFinding(
  siteId: string,
  findingId: string,
): Promise<MarketingFinding> {
  return patchFinding(siteId, findingId, {
    status: "acknowledged",
    resolved_at: null,
  });
}

/** Undo an acknowledgement — back to plain open. */
export function unacknowledgeFinding(
  siteId: string,
  findingId: string,
): Promise<MarketingFinding> {
  return patchFinding(siteId, findingId, { status: "open", resolved_at: null });
}

/**
 * "I fixed this." A claim, not a verdict: the next analysis re-checks it, and
 * a condition that is genuinely still broken comes back on this same row as
 * `reopened`. That is what makes the button safe to offer — a wrong click
 * costs one analysis cycle, never a silently buried defect.
 *
 * `resolved_at` is the client's clock (PostgREST cannot send `now()` as a
 * value). It is a user-action timestamp, not evidence — the analyzer's own
 * `resolved_at` and the immutable `analysis_result` trail are the record of
 * when the condition actually cleared.
 */
export function resolveFinding(
  siteId: string,
  findingId: string,
): Promise<MarketingFinding> {
  return patchFinding(siteId, findingId, {
    status: "resolved",
    resolved_at: new Date().toISOString(),
  });
}

/** "No — it's back." The schema's own word for a resolved finding returning. */
export function reopenFinding(
  siteId: string,
  findingId: string,
): Promise<MarketingFinding> {
  return patchFinding(siteId, findingId, {
    status: "reopened",
    resolved_at: null,
  });
}

// ── Bulk verbs ──────────────────────────────────────────────────────────────

export function bulkSuppressFindings(
  siteId: string,
  findingIds: string[],
  reason: string,
): Promise<MarketingFinding[]> {
  return patchFindings(siteId, findingIds, {
    suppressed: true,
    suppressed_reason: requireReason(reason),
  });
}

export function bulkUnsuppressFindings(
  siteId: string,
  findingIds: string[],
): Promise<MarketingFinding[]> {
  return patchFindings(siteId, findingIds, {
    suppressed: false,
    suppressed_reason: null,
  });
}

export function bulkAcknowledgeFindings(
  siteId: string,
  findingIds: string[],
): Promise<MarketingFinding[]> {
  return patchFindings(siteId, findingIds, {
    status: "acknowledged",
    resolved_at: null,
  });
}

export function bulkResolveFindings(
  siteId: string,
  findingIds: string[],
): Promise<MarketingFinding[]> {
  return patchFindings(siteId, findingIds, {
    status: "resolved",
    resolved_at: new Date().toISOString(),
  });
}

export function bulkReopenFindings(
  siteId: string,
  findingIds: string[],
): Promise<MarketingFinding[]> {
  return patchFindings(siteId, findingIds, {
    status: "reopened",
    resolved_at: null,
  });
}

/**
 * "This whole check is noise on this site." The one bulk action that is not a
 * selection: it reaches every LIVE, not-yet-suppressed finding for one
 * `item_key` across the site, including the ones on pages the user has not
 * scrolled to — which is the point. A check that is wrong for this site is
 * wrong on all 400 pages, and clearing it one page at a time is why registers
 * get abandoned.
 *
 * Scoped deliberately: `resolved` rows are history and stay untouched, and
 * already-suppressed rows keep the reason they already carry rather than
 * having it overwritten.
 */
export async function suppressFindingsByCheck(
  siteId: string,
  itemKey: string,
  reason: string,
): Promise<number> {
  const response = await (await authenticatedWebDb(supabase))
    .from("finding")
    .update({ suppressed: true, suppressed_reason: requireReason(reason) })
    .eq("site_id", siteId)
    .eq("item_key", itemKey)
    .eq("suppressed", false)
    .in("status", [...LIVE_FINDING_STATUSES])
    .is("deleted_at", null)
    .select("id");
  if (response.error) throw translateFindingWriteError(response.error);
  return response.data?.length ?? 0;
}

/** Undo a whole-check suppression — every suppressed row for that check. */
export async function unsuppressFindingsByCheck(
  siteId: string,
  itemKey: string,
): Promise<number> {
  const response = await (await authenticatedWebDb(supabase))
    .from("finding")
    .update({ suppressed: false, suppressed_reason: null })
    .eq("site_id", siteId)
    .eq("item_key", itemKey)
    .eq("suppressed", true)
    .is("deleted_at", null)
    .select("id");
  if (response.error) throw translateFindingWriteError(response.error);
  return response.data?.length ?? 0;
}
