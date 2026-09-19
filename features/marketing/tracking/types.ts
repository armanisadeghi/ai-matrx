/**
 * The shapes a tracking snapshot carries, parsed from `web.tag_manager_snapshot`.
 *
 * The row's `findings` column is a jsonb payload whose `__kind` is
 * `tag_manager_findings` — a CHECK constraint in aidream migration 0768 refuses a payload
 * without the marker, and `aidream/services/google_sync/kinds.py` is the one writer that stamps
 * it. 🚨 `__kind` IS PART OF THE DATA: nothing here strips it, and `parseTrackingFindings`
 * accepts-and-ignores an unknown key rather than choking on a payload a newer server wrote.
 */

import type { Database, Json } from "@/types/database.types";

export type TagManagerSnapshotRow =
  Database["web"]["Tables"]["tag_manager_snapshot"]["Row"];

export const TAG_MANAGER_FINDINGS_KIND = "tag_manager_findings" as const;

/** `not_checked` is a first-class verdict: we did not look, and we say so. */
export type TrackingVerdict = "pass" | "fail" | "not_checked";

export interface TrackingCheck {
  id: string;
  verdict: TrackingVerdict;
  /** What we saw. Always present — a verdict with no evidence is an opinion. */
  evidence: string;
  /** What to do about it. `null` on a passing check. */
  remedy: string | null;
  /** Only the page-reconciliation check carries these. */
  source?: "live_page_fetch" | "none";
  fetchedUrl?: string | null;
  httpStatus?: number | null;
}

export interface TrackingFindings {
  __kind: typeof TAG_MANAGER_FINDINGS_KIND;
  checks: TrackingCheck[];
  accountId: string | null;
  containerId: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  /** The read hit its bound, so the graded list is not the whole container. */
  truncated: boolean;
  /** The server's own words about what the read can and cannot see. Printed verbatim. */
  caveat: string | null;
  /** The container-versus-live-page check, also present inside `checks`. */
  pageReconciliation: TrackingCheck | null;
}

/** The id the server gives the container-versus-live-page check. */
export const PAGE_RECONCILIATION_CHECK_ID = "container_on_the_page" as const;

/**
 * The three checks the site record grades, in the order a reader needs them, with the plain
 * words the PLAN §4.10 line uses. The server emits more (`ga4_not_double_counted` is the
 * money-losing one); the panel prints every check it receives and these three lead.
 */
export const HEADLINE_CHECK_IDS = [
  "ga4_installed",
  "conversion_tracked",
  "consent_configured",
] as const;

export const CHECK_LABELS: Record<string, string> = {
  ga4_installed: "GA4 installed and firing",
  ga4_not_double_counted: "GA4 counted once, not twice",
  conversion_tracked: "Contact-form conversion tracked",
  consent_configured: "Consent configured",
  [PAGE_RECONCILIATION_CHECK_ID]: "The container is on the live site",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function verdictOf(value: unknown): TrackingVerdict {
  // 🚨 An unrecognised word is NOT a pass. A server that grows a fourth verdict must never be
  // read here as "everything is fine"; `not_checked` is the honest reading of "we do not know
  // what this says".
  return value === "pass" || value === "fail" ? value : "not_checked";
}

function parseCheck(value: unknown): TrackingCheck | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  if (!id) return null;
  return {
    id,
    verdict: verdictOf(value.verdict),
    evidence: text(value.evidence),
    remedy: nullableText(value.remedy),
    ...(value.source === "live_page_fetch" || value.source === "none"
      ? { source: value.source }
      : {}),
    ...(typeof value.fetched_url === "string"
      ? { fetchedUrl: value.fetched_url }
      : {}),
    ...(typeof value.http_status === "number"
      ? { httpStatus: value.http_status }
      : {}),
  };
}

/**
 * Parse a stored `findings` payload. A payload that is not the declared kind returns `null` —
 * the panel then says it cannot read this snapshot rather than rendering a blank grade.
 */
export function parseTrackingFindings(value: Json): TrackingFindings | null {
  if (!isRecord(value)) return null;
  if (value.__kind !== TAG_MANAGER_FINDINGS_KIND) return null;
  const checks = Array.isArray(value.checks)
    ? value.checks.flatMap((entry) => {
        const parsed = parseCheck(entry);
        return parsed ? [parsed] : [];
      })
    : [];
  const reconciliation =
    parseCheck(value.page_reconciliation) ??
    checks.find((check) => check.id === PAGE_RECONCILIATION_CHECK_ID) ??
    null;
  return {
    __kind: TAG_MANAGER_FINDINGS_KIND,
    checks,
    accountId: nullableText(value.account_id),
    containerId: nullableText(value.container_id),
    workspaceId: nullableText(value.workspace_id),
    workspaceName: nullableText(value.workspace_name),
    truncated: value.truncated === true,
    caveat: nullableText(value.caveat),
    pageReconciliation: reconciliation,
  };
}
