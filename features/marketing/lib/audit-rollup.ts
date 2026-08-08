/**
 * Site-audit rollup — pure aggregation over the canonical page registry's
 * stored deterministic metrics (`web.snapshot.seo_metrics` +
 * `audit_metrics`, stamped per capture) plus the live URL-quality
 * evaluation (needs no crawl data). No I/O; unit-tested in
 * `audit-rollup.test.ts`.
 */

import {
  parseStoredSeoMetrics,
  type StoredSeoMetrics,
} from "@/features/marketing/seo/serp/metrics";
import {
  parseStoredAuditMetrics,
  urlQualityToStored,
  type StoredAuditMetrics,
} from "@/features/marketing/seo/audit/stored";
import { evaluateUrlQuality } from "@/features/marketing/seo/audit/url-quality";
import type { AuditSeverity } from "@/features/marketing/seo/audit/types";

/** Raw fetch shape: one canonical page + its latest snapshot's metric columns. */
export interface AuditSourceRow {
  id: string;
  url: string;
  path: string | null;
  /** Latest detected response kind. Null means not fetched or historical unknown. */
  contentTypeLast: string | null;
  seo_metrics: unknown;
  audit_metrics: unknown;
}

export type AuditSection =
  "serp" | "social" | "headings" | "indexability" | "url";

export interface AuditIssueRollup {
  section: AuditSection;
  severity: AuditSeverity;
  message: string;
  /** Total pages this exact issue appears on. */
  count: number;
  /** Up to `SAMPLE_LIMIT` example pages for drill-down. */
  samples: { pageId: string; path: string }[];
}

export interface AuditPageRollup {
  pageId: string;
  path: string;
  url: string;
  errorCount: number;
  warningCount: number;
  indexabilityVerdict: "indexable" | "check" | "blocked" | null;
}

export interface SiteAuditRollup {
  /** Canonical URLs eligible for page auditing (HTML or not fetched yet). */
  totalPages: number;
  /** Known non-HTML resources excluded from HTML-only page findings. */
  nonHtmlResources: number;
  /** Pages whose latest snapshot carries stored metrics. */
  auditedPages: number;
  /** Pages with no computed metrics yet (never crawled or pre-stamping). */
  uncomputedPages: number;
  verdicts: { indexable: number; check: number; blocked: number };
  /** Pass counts among audited pages, per section. */
  passes: { serp: number; social: number; headings: number; url: number };
  /**
   * EVERY distinct issue, ranked errors first then by page count. Complete by
   * design — truncation happens at render only, so copy/export/show-all can
   * always reach the full list.
   */
  topIssues: AuditIssueRollup[];
  /**
   * EVERY page with at least one finding, worst first (errors, then
   * warnings). Complete by design — truncation happens at render only.
   */
  worstPages: AuditPageRollup[];
}

const SAMPLE_LIMIT = 3;

export function buildSiteAuditRollup(rows: AuditSourceRow[]): SiteAuditRollup {
  const issueMap = new Map<string, AuditIssueRollup>();
  const pages: AuditPageRollup[] = [];
  let auditedPages = 0;
  let nonHtmlResources = 0;
  const verdicts = { indexable: 0, check: 0, blocked: 0 };
  const passes = { serp: 0, social: 0, headings: 0, url: 0 };

  const record = (
    section: AuditSection,
    severity: AuditSeverity,
    message: string,
    page: { id: string; path: string },
  ) => {
    const key = `${section}\u0000${message}`;
    const existing = issueMap.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.samples.length < SAMPLE_LIMIT) {
        existing.samples.push({ pageId: page.id, path: page.path });
      }
    } else {
      issueMap.set(key, {
        section,
        severity,
        message,
        count: 1,
        samples: [{ pageId: page.id, path: page.path }],
      });
    }
  };

  for (const row of rows) {
    if (row.contentTypeLast !== null && row.contentTypeLast !== "html") {
      nonHtmlResources += 1;
      continue;
    }
    const path = row.path || row.url;
    const seo: StoredSeoMetrics | null = parseStoredSeoMetrics(row.seo_metrics);
    const audit: StoredAuditMetrics | null = parseStoredAuditMetrics(
      row.audit_metrics,
    );
    // URL quality is always computable — stored copy preferred, live otherwise.
    const urlQuality =
      audit?.url ?? urlQualityToStored(evaluateUrlQuality(row.url));

    let errorCount = 0;
    let warningCount = 0;
    const page = { id: row.id, path };

    for (const issue of urlQuality.issues) {
      record("url", issue.severity, issue.message, page);
      if (issue.severity === "error") errorCount += 1;
      else warningCount += 1;
    }
    if (urlQuality.ok) passes.url += 1;

    if (seo || audit) auditedPages += 1;

    if (seo) {
      if (seo.overall_ok) passes.serp += 1;
      for (const issue of [...seo.title.issues, ...seo.description.issues]) {
        // SERP issues are stored as plain strings — all length/width limit
        // violations, surfaced as warnings in the rollup.
        record("serp", "warning", issue, page);
        warningCount += 1;
      }
    }
    if (audit) {
      if (audit.social.ok) passes.social += 1;
      if (audit.headings.ok) passes.headings += 1;
      verdicts[audit.indexability.verdict] += 1;
      for (const [section, issues] of [
        ["social", audit.social.issues],
        ["headings", audit.headings.issues],
        ["indexability", audit.indexability.issues],
      ] as const) {
        for (const issue of issues) {
          record(section, issue.severity, issue.message, page);
          if (issue.severity === "error") errorCount += 1;
          else warningCount += 1;
        }
      }
    }

    pages.push({
      pageId: row.id,
      path,
      url: row.url,
      errorCount,
      warningCount,
      indexabilityVerdict: audit?.indexability.verdict ?? null,
    });
  }

  const topIssues = [...issueMap.values()]
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      if (b.count !== a.count) return b.count - a.count;
      return a.message.localeCompare(b.message);
    });

  const worstPages = pages
    .filter((page) => page.errorCount + page.warningCount > 0)
    .sort((a, b) => {
      if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
      if (b.warningCount !== a.warningCount)
        return b.warningCount - a.warningCount;
      return a.path.localeCompare(b.path);
    });

  return {
    totalPages: rows.length - nonHtmlResources,
    nonHtmlResources,
    auditedPages,
    uncomputedPages: rows.length - nonHtmlResources - auditedPages,
    verdicts,
    passes,
    topIssues,
    worstPages,
  };
}

/**
 * Site audit score trend (M-55) — reuses `buildSiteAuditRollup` unchanged,
 * one call PER capture day, over every historical snapshot instead of just
 * each page's latest. Every crawl/fetch creates a new immutable
 * `web.snapshot` row, so this is real history already sitting in the
 * table — never a synthesized or re-derived score.
 */
export interface AuditTrendSourceRow extends AuditSourceRow {
  /** UTC calendar day the snapshot was captured, e.g. "2026-07-23". */
  capturedDay: string;
}

export interface AuditTrendPoint {
  day: string;
  /** 0-100 composite: average pass rate across the 4 rollup sections. Null
   * when nothing was audited that day. */
  overallScore: number | null;
  totalPages: number;
  auditedPages: number;
}

export function buildSiteAuditTrend(
  rows: AuditTrendSourceRow[],
): AuditTrendPoint[] {
  const byDay = new Map<string, AuditSourceRow[]>();
  for (const row of rows) {
    const bucket = byDay.get(row.capturedDay);
    if (bucket) bucket.push(row);
    else byDay.set(row.capturedDay, [row]);
  }

  const points: AuditTrendPoint[] = [];
  for (const [day, dayRows] of byDay) {
    const rollup = buildSiteAuditRollup(dayRows);
    const sectionsTotal = 4 * rollup.auditedPages;
    const sectionsPassed =
      rollup.passes.serp +
      rollup.passes.social +
      rollup.passes.headings +
      rollup.passes.url;
    points.push({
      day,
      overallScore:
        sectionsTotal > 0
          ? Math.round((sectionsPassed / sectionsTotal) * 100)
          : null,
      totalPages: rollup.totalPages,
      auditedPages: rollup.auditedPages,
    });
  }
  return points.sort((a, b) => a.day.localeCompare(b.day));
}
