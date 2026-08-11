/**
 * URL-quality evaluation — deterministic checks on the URL string itself.
 *
 * ONE rule, THREE mirrors — thresholds and issue strings byte-identical.
 * Change one, change all three:
 *   * here
 *   * `matrx_scraper/audit_metrics.py` `evaluate_url_quality` (the writer)
 *   * `web.url_quality_metrics(text)` (SQL, migration
 *     `web_site_audit_rollup_server_side.sql`) — the server-side site-audit
 *     rollup needs it for every page whose stored payload predates the `url`
 *     section. Parity was proved over all 10,437 distinct registry URLs.
 *
 * Every finding is a warning — a URL never blocks indexing by shape alone —
 * so `ok` means "no warnings" for this section (unlike the other sections,
 * where `ok` means "no errors"). Needs no crawl data: consumers may compute
 * it live from `web.page.url` anywhere; the stored copy exists so agents and
 * SQL see it beside the other sections.
 */

import type { AuditIssue } from "./types";

/** URLs longer than this are hard to read, share, and display in SERPs. */
export const URL_MAX_CHARS = 100;
/** Path depth beyond this suggests content buried too deep in the hierarchy. */
export const URL_MAX_DEPTH = 4;

export interface UrlQualityEvaluation {
  /** No issues at all (this section emits warnings only). */
  ok: boolean;
  length: number;
  /** Number of non-empty path segments. */
  depth: number;
  hasUppercase: boolean;
  hasUnderscore: boolean;
  hasQuery: boolean;
  hasFragment: boolean;
  hasEncodedChars: boolean;
  hasDoubleSlash: boolean;
  issues: AuditIssue[];
}

function codePointCount(text: string): number {
  return Array.from(text).length;
}

export function evaluateUrlQuality(url: string): UrlQualityEvaluation {
  const trimmed = url.trim();
  const length = codePointCount(trimmed);

  let path = "";
  let query = "";
  let fragment = "";
  try {
    const parsed = new URL(trimmed);
    path = parsed.pathname;
    query = parsed.search;
    fragment = parsed.hash;
  } catch {
    // Not parseable — evaluate what we can from the raw string.
    path = trimmed;
  }

  const segments = path.split("/").filter(Boolean);
  const depth = segments.length;
  const hasUppercase = /[A-Z]/.test(path);
  const hasUnderscore = path.includes("_");
  const hasQuery = query.length > 1;
  const hasFragment = fragment.length > 1;
  const hasEncodedChars = /%[0-9A-Fa-f]{2}/.test(path);
  const hasDoubleSlash = path.includes("//");

  const issues: AuditIssue[] = [];
  if (length > URL_MAX_CHARS)
    issues.push({
      severity: "warning",
      message: `URL is long (${length} chars) — keep URLs under ${URL_MAX_CHARS} characters`,
    });
  if (depth > URL_MAX_DEPTH)
    issues.push({
      severity: "warning",
      message: `URL is ${depth} levels deep — content buried past ${URL_MAX_DEPTH} levels reads as less important`,
    });
  if (hasUppercase)
    issues.push({
      severity: "warning",
      message:
        "URL path contains uppercase letters — mixed case creates duplicate-URL risk",
    });
  if (hasUnderscore)
    issues.push({
      severity: "warning",
      message:
        "URL path contains underscores — Google treats hyphens as word separators, underscores as joiners",
    });
  if (hasQuery)
    issues.push({
      severity: "warning",
      message:
        "URL carries query parameters — parameterized URLs fragment crawl equity and analytics",
    });
  if (hasFragment)
    issues.push({
      severity: "warning",
      message: "URL carries a #fragment — fragments are ignored by crawlers",
    });
  if (hasEncodedChars)
    issues.push({
      severity: "warning",
      message:
        "URL path contains percent-encoded characters — prefer plain lowercase ASCII slugs",
    });
  if (hasDoubleSlash)
    issues.push({
      severity: "warning",
      message: "URL path contains a double slash — usually a link-building bug",
    });

  return {
    ok: issues.length === 0,
    length,
    depth,
    hasUppercase,
    hasUnderscore,
    hasQuery,
    hasFragment,
    hasEncodedChars,
    hasDoubleSlash,
    issues,
  };
}
