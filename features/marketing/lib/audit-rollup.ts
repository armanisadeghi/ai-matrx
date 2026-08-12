/**
 * Site-audit rollup — pure aggregation over the canonical page registry's
 * stored deterministic metrics (`web.snapshot.seo_metrics` +
 * `audit_metrics`, stamped per capture) plus the live URL-quality
 * evaluation (needs no crawl data). No I/O; unit-tested in
 * `audit-rollup.test.ts`.
 *
 * 🚨 THIS FILE IS THE SPECIFICATION, NOT THE PRODUCTION PATH.
 *
 * The app aggregates in POSTGRES — `web.site_audit_rollup(uuid)` and
 * `web.site_audit_trend(uuid)` (migration
 * `migrations/web_site_audit_rollup_server_side.sql`), consumed by
 * `fetchSiteAuditRollup` / `fetchSiteAuditTrend`. Aggregating in the browser
 * meant shipping every page row plus every latest snapshot's full metrics
 * jsonb over the wire (6.9 MB for allgreenrecycling.com's 4,531 pages) behind
 * a 5,000-row cap that THREW instead of truncating.
 *
 * `buildSiteAuditRollup` / `buildSiteAuditTrend` stay as the executable,
 * jest-tested definition of the counting semantics the SQL must reproduce:
 * URL-quality issues counted for every page, SERP title/description issues
 * always warnings, social/headings/indexability issues by their own severity,
 * machine resources excluded by the shared classification rule, GONE pages
 * (`status = 'missing'`) excluded from every HTML-quality finding and reported
 * as their own GSC-ranked finding instead.
 * CHANGE ONE, CHANGE BOTH — and re-prove parity against real sites before
 * shipping (the check that gated the cutover diffed both implementations over
 * 5 live sites and all 10,437 distinct registry URLs).
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
import { isResourceContentType } from "@/features/marketing/lib/page-content-class";
import type { AuditSeverity } from "@/features/marketing/seo/audit/types";

/** Raw fetch shape: one canonical page + its latest snapshot's metric columns. */
export interface AuditSourceRow {
  id: string;
  url: string;
  path: string | null;
  /** Latest detected response kind. Null means not fetched or historical unknown. */
  contentTypeLast: string | null;
  /**
   * The canonical page this URL resolves to. When it points at a DIFFERENT row,
   * this URL is an alias — the same document reached a second way (the live
   * cases are `http://` twins of `https://` pages) — and counting it would
   * double every finding on that document. Same rule as `v_page_list.is_canonical`
   * and matrx-scraper `analysis.py` (`pages_skipped_alias`).
   */
  canonicalPageId?: string | null;
  /**
   * `web.page.status`. `'missing'` means the crawler no longer finds this URL —
   * the page is GONE. Its last-known HTML metrics describe a document that no
   * longer resolves, so scoring it as a live page is worse than useless: the
   * user edits an og:title on a 404. Gone pages are set aside from every
   * HTML-quality finding and reported as their own finding instead. Null/absent
   * is treated as live (historical rows, and the TS callers that pre-date this).
   */
  status?: string | null;
  /** Google Search Console clicks over the last 28 days (`v_page_list`). */
  gscClicks28d?: number | null;
  /** Google Search Console impressions over the last 28 days (`v_page_list`). */
  gscImpressions28d?: number | null;
  /** When the crawler last saw this URL — how long it has been gone. */
  lastSeen?: string | null;
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

/**
 * A page the crawler used to find and no longer does — the finding, not a
 * footnote. Ranked by the traffic it was earning, because that is what a gone
 * page actually costs: one with recent impressions is lost money, one with none
 * is housekeeping.
 */
export interface GonePageRollup {
  pageId: string;
  path: string;
  url: string;
  /** GSC clicks in the last 28 days. Null when the page is not in GSC at all. */
  gscClicks28d: number | null;
  /** GSC impressions in the last 28 days. Null when not in GSC at all. */
  gscImpressions28d: number | null;
  /** ISO timestamp of the last crawl that still found this URL. */
  lastSeen: string | null;
}

export interface SiteAuditRollup {
  /** Canonical URLs eligible for page auditing (HTML or not fetched yet). */
  totalPages: number;
  /** Known non-HTML resources excluded from HTML-only page findings. */
  nonHtmlResources: number;
  /**
   * Pages the crawler no longer finds (`status = 'missing'`), set aside from
   * every HTML-quality finding. Their own finding — see `gonePageDetails`.
   */
  gonePages: number;
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
  /**
   * EVERY gone page, costliest first (GSC clicks, then impressions, then how
   * recently it was last seen). Complete by design — truncation happens at
   * render only.
   */
  gonePageDetails: GonePageRollup[];
}

const SAMPLE_LIMIT = 3;

/**
 * Text ordering that MATCHES POSTGRES, which is what every ORDER BY in
 * `web.site_audit_rollup` actually uses. The database collates `C.UTF-8` —
 * plain byte order — so `/Hard-Drive-Shredding` sorts before `/akron` there.
 * `localeCompare` does the opposite, and the two implementations then disagree
 * about the order of pages tied on severity for no reason anyone can see.
 * Code-point comparison is the byte order.
 */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Narrowing for the server-side aggregates. The RPCs return `jsonb`, which the
// generated Supabase types surface as `Json` — these turn that into the typed
// shapes above, and THROW LOUDLY on anything else rather than handing a
// half-shaped object to the workspace.
// ---------------------------------------------------------------------------

const AUDIT_SECTIONS: readonly AuditSection[] = [
  "serp",
  "social",
  "headings",
  "indexability",
  "url",
];
const VERDICTS = ["indexable", "check", "blocked"] as const;

function bad(what: string): never {
  throw new Error(
    `Site audit aggregate returned an unexpected shape (${what}). ` +
      "Check web.site_audit_rollup / web.site_audit_trend against " +
      "features/marketing/lib/audit-rollup.ts.",
  );
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) bad(what);
  return value as Record<string, unknown>;
}

function int(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) bad(what);
  return value;
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string") bad(what);
  return value;
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) bad(what);
  return value;
}

function intOrNull(value: unknown, what: string): number | null {
  if (value === null || value === undefined) return null;
  return int(value, what);
}

function strOrNull(value: unknown, what: string): string | null {
  if (value === null || value === undefined) return null;
  return str(value, what);
}

export function parseSiteAuditRollup(value: unknown): SiteAuditRollup {
  const root = record(value, "rollup");
  const verdicts = record(root.verdicts, "rollup.verdicts");
  const passes = record(root.passes, "rollup.passes");
  return {
    totalPages: int(root.totalPages, "rollup.totalPages"),
    nonHtmlResources: int(root.nonHtmlResources, "rollup.nonHtmlResources"),
    gonePages: int(root.gonePages, "rollup.gonePages"),
    auditedPages: int(root.auditedPages, "rollup.auditedPages"),
    uncomputedPages: int(root.uncomputedPages, "rollup.uncomputedPages"),
    verdicts: {
      indexable: int(verdicts.indexable, "rollup.verdicts.indexable"),
      check: int(verdicts.check, "rollup.verdicts.check"),
      blocked: int(verdicts.blocked, "rollup.verdicts.blocked"),
    },
    passes: {
      serp: int(passes.serp, "rollup.passes.serp"),
      social: int(passes.social, "rollup.passes.social"),
      headings: int(passes.headings, "rollup.passes.headings"),
      url: int(passes.url, "rollup.passes.url"),
    },
    topIssues: list(root.topIssues, "rollup.topIssues").map((entry) => {
      const issue = record(entry, "rollup.topIssues[]");
      const section = str(issue.section, "rollup.topIssues[].section");
      if (!AUDIT_SECTIONS.includes(section as AuditSection))
        bad(`rollup.topIssues[].section=${section}`);
      const severity = str(issue.severity, "rollup.topIssues[].severity");
      if (severity !== "error" && severity !== "warning")
        bad(`rollup.topIssues[].severity=${severity}`);
      return {
        section: section as AuditSection,
        severity,
        message: str(issue.message, "rollup.topIssues[].message"),
        count: int(issue.count, "rollup.topIssues[].count"),
        samples: list(issue.samples, "rollup.topIssues[].samples").map(
          (raw) => {
            const sample = record(raw, "rollup.topIssues[].samples[]");
            return {
              pageId: str(sample.pageId, "rollup.topIssues[].samples[].pageId"),
              path: str(sample.path, "rollup.topIssues[].samples[].path"),
            };
          },
        ),
      };
    }),
    worstPages: list(root.worstPages, "rollup.worstPages").map((entry) => {
      const page = record(entry, "rollup.worstPages[]");
      const verdict = page.indexabilityVerdict;
      if (
        verdict !== null &&
        !VERDICTS.includes(verdict as (typeof VERDICTS)[number])
      )
        bad(`rollup.worstPages[].indexabilityVerdict=${String(verdict)}`);
      return {
        pageId: str(page.pageId, "rollup.worstPages[].pageId"),
        path: str(page.path, "rollup.worstPages[].path"),
        url: str(page.url, "rollup.worstPages[].url"),
        errorCount: int(page.errorCount, "rollup.worstPages[].errorCount"),
        warningCount: int(
          page.warningCount,
          "rollup.worstPages[].warningCount",
        ),
        indexabilityVerdict: verdict as AuditPageRollup["indexabilityVerdict"],
      };
    }),
    gonePageDetails: list(root.gonePageDetails, "rollup.gonePageDetails").map(
      (entry) => {
        const page = record(entry, "rollup.gonePageDetails[]");
        return {
          pageId: str(page.pageId, "rollup.gonePageDetails[].pageId"),
          path: str(page.path, "rollup.gonePageDetails[].path"),
          url: str(page.url, "rollup.gonePageDetails[].url"),
          gscClicks28d: intOrNull(
            page.gscClicks28d,
            "rollup.gonePageDetails[].gscClicks28d",
          ),
          gscImpressions28d: intOrNull(
            page.gscImpressions28d,
            "rollup.gonePageDetails[].gscImpressions28d",
          ),
          lastSeen: strOrNull(
            page.lastSeen,
            "rollup.gonePageDetails[].lastSeen",
          ),
        };
      },
    ),
  };
}

export function buildSiteAuditRollup(rows: AuditSourceRow[]): SiteAuditRollup {
  const issueMap = new Map<string, AuditIssueRollup>();
  const pages: AuditPageRollup[] = [];
  let auditedPages = 0;
  let nonHtmlResources = 0;
  let aliasRows = 0;
  const gonePageDetails: GonePageRollup[] = [];
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
    if (row.canonicalPageId && row.canonicalPageId !== row.id) {
      aliasRows += 1;
      continue;
    }
    if (isResourceContentType(row.contentTypeLast, row.url)) {
      nonHtmlResources += 1;
      continue;
    }
    // GONE BEFORE HTML QUALITY. Every check below scores a document — the
    // og:title it carries, the headings it uses, whether Google may index it.
    // On a URL that no longer resolves those verdicts are about a corpse, and
    // acting on them means editing a page that does not exist. So a gone page
    // contributes no issue, no pass, and no verdict; it becomes its own
    // finding. Resources are classified first on purpose: a /wp-json endpoint
    // disappearing is not lost traffic, it is a crawler detail.
    if (row.status === "missing") {
      gonePageDetails.push({
        pageId: row.id,
        path: row.path || row.url,
        url: row.url,
        gscClicks28d: row.gscClicks28d ?? null,
        gscImpressions28d: row.gscImpressions28d ?? null,
        lastSeen: row.lastSeen ?? null,
      });
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
      return byText(a.message, b.message);
    });

  const worstPages = pages
    .filter((page) => page.errorCount + page.warningCount > 0)
    .sort((a, b) => {
      if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
      if (b.warningCount !== a.warningCount)
        return b.warningCount - a.warningCount;
      if (a.path !== b.path) return byText(a.path, b.path);
      // Two pages CAN share a path (same path, different query string), and
      // then every key above ties. Without a unique final key the order is
      // arbitrary on both sides and the two implementations disagree for no
      // reason — the unstable-ORDER-BY class. pageId settles it.
      return byText(a.pageId, b.pageId);
    });

  // Costliest first: the clicks a gone page was earning, then the impressions,
  // then how recently it was last seen. A page with no GSC row at all sorts as
  // zero — real housekeeping, ranked below anything Google still showed.
  const gonePages = gonePageDetails.sort((a, b) => {
    const clicks = (b.gscClicks28d ?? 0) - (a.gscClicks28d ?? 0);
    if (clicks !== 0) return clicks;
    const impressions =
      (b.gscImpressions28d ?? 0) - (a.gscImpressions28d ?? 0);
    if (impressions !== 0) return impressions;
    if (a.lastSeen !== b.lastSeen)
      return byText(b.lastSeen ?? "", a.lastSeen ?? "");
    if (a.path !== b.path) return byText(a.path, b.path);
    return byText(a.pageId, b.pageId);
  });

  const livePages =
    rows.length - nonHtmlResources - aliasRows - gonePages.length;

  return {
    totalPages: livePages,
    nonHtmlResources,
    gonePages: gonePages.length,
    auditedPages,
    uncomputedPages: livePages - auditedPages,
    verdicts,
    passes,
    topIssues,
    worstPages,
    gonePageDetails: gonePages,
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

/** Narrow the `web.site_audit_trend` jsonb payload. Throws on any other shape. */
export function parseSiteAuditTrend(value: unknown): AuditTrendPoint[] {
  return list(value, "trend").map((entry) => {
    const point = record(entry, "trend[]");
    const score = point.overallScore;
    if (score !== null && typeof score !== "number") bad("trend[].overallScore");
    return {
      day: str(point.day, "trend[].day"),
      overallScore: score,
      totalPages: int(point.totalPages, "trend[].totalPages"),
      auditedPages: int(point.auditedPages, "trend[].auditedPages"),
    };
  });
}
