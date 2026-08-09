/**
 * Finding lifecycle writes — the user half of `web.finding`.
 *
 * The analyzer owns detection (open / refresh / resolve — see aidream
 * `web_crawl/analysis.py::_reconcile_findings`, which explicitly never
 * touches suppression). The USER owns judgement: "I've seen this" and
 * "this is intentional, stop telling me". Those two verbs live here.
 *
 * Direct to Supabase under the caller's JWT (RLS is the authorization
 * layer) — a lifecycle marker is pure UI↔DB and must never take a hop
 * through the Python server (CLAUDE.md § Data flow).
 *
 * Why this exists: every finding needs an honest exit. Some checks
 * (`meta_robots_conflicts` on a deliberately hidden page, `broken_page_4xx`
 * on a page you retired on purpose) are CORRECT behaviour for this site, and
 * a register that cannot record that is a register the user stops reading.
 */

import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import type { MarketingFinding } from "@/features/marketing/data/analysis-types";
import { assertFound } from "@/features/marketing/data/service";

const FINDING_COLUMNS =
  "id, organization_id, created_at, updated_at, created_by, updated_by, deleted_at, version, metadata, site_id, subject_type, subject_id, page_id, item_id, item_key, category, subcategory, severity, status, suppressed, suppressed_reason, first_result_id, last_result_id, first_detected_at, last_detected_at, resolved_at";

async function patchFinding(
  siteId: string,
  findingId: string,
  patch: {
    status?: string;
    suppressed?: boolean;
    suppressed_reason?: string | null;
  },
): Promise<MarketingFinding> {
  const response = await (await authenticatedWebDb(supabase))
    .from("finding")
    .update(patch)
    .eq("site_id", siteId)
    .eq("id", findingId)
    .is("deleted_at", null)
    .select(FINDING_COLUMNS)
    .maybeSingle();
  return assertFound(response.data, response.error, "finding");
}

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
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new Error("Say why this is intentional — the reason is the record.");
  }
  return patchFinding(siteId, findingId, {
    suppressed: true,
    suppressed_reason: trimmed,
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

/**
 * "I've seen this and I'm on it." Acknowledged findings stay OPEN (aidream
 * treats `acknowledged` as a live status) — only a passing re-analysis
 * resolves a finding, never a click.
 */
export function acknowledgeFinding(
  siteId: string,
  findingId: string,
): Promise<MarketingFinding> {
  return patchFinding(siteId, findingId, { status: "acknowledged" });
}

/** Undo an acknowledgement — back to plain open. */
export function reopenFinding(
  siteId: string,
  findingId: string,
): Promise<MarketingFinding> {
  return patchFinding(siteId, findingId, { status: "open" });
}
