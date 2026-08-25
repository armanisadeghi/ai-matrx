"use client";

/**
 * features/marketing/content-plan/setup/bridge.ts
 *
 * The Setup view's "make it real" seam — the plan↔CMS bridge, over aidream's
 * HTTP mirrors of the `content_plan cms_reconcile` / `cms_align` tool actions:
 *
 *   POST /content-plan/sites/{site_id}/cms-reconcile   → the diff report
 *   POST /content-plan/sites/{site_id}/cms-align       → realize (dry-run/apply)
 *   POST /content-plan/sites/{site_id}/cms-starter-kit → seed the site shell
 *   POST /content-plan/sites/{site_id}/cms-publish     → bulk publish (dry-run/apply)
 *
 * These are REAL server work (guarded CMS writes: agent_write_policy +
 * client_activity_log live behind aidream's page_service/site_service), so the
 * Python brain is the right callee — this is not a DB read the browser could
 * do itself. CMS site CREATION stays on the existing `/api/cms/*` admin seam
 * (`CmsSiteService.createSite`), and the plan-side link is a plain settings
 * write on `web.site` — both pre-existing canonical paths; nothing here opens
 * a new one.
 *
 * HONESTY RULE (same as readiness.ts): every bucket count shown is the
 * server's own report, parsed defensively — a row we cannot read is dropped
 * LOUDLY into `problems`, never silently counted or invented.
 */
import { callApi, type ApiCallResult } from "@/lib/api/call-api";
import { describeBackendFailure, parseStreamError } from "@/lib/api/errors";
import { CmsSiteService } from "@/features/cms/services/cmsService";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import type { components } from "@/types/python-generated/api-types";
import { isJsonObject } from "@/types/json";
import {
  coerceEffortTier,
  DEFAULT_EFFORT_TIER,
  type EffortTier,
} from "./effort";
import type { AppDispatch } from "@/lib/redux/store";

import { slugify } from "./archetypes";
import { fetchFreshSite } from "./draft";
import { normalizeDomain } from "./readiness";

// ── report shapes (narrowed from the server's per-bucket dict rows) ─────────

export interface BridgeGhost {
  nodeId: string;
  route: string;
  label: string;
}

export interface BridgeReport {
  cmsSiteId: string;
  cmsSiteSlug: string;
  matched: number;
  ghosts: BridgeGhost[];
  orphans: number;
  conflicts: number;
  retired: number;
  linksWritten: number;
  warnings: string[];
  /** Rows the client could not parse — surfaced, never swallowed. */
  problems: string[];
}

export interface BridgeAlignItem {
  action: string;
  nodeId: string | null;
  pageId: string | null;
  ok: boolean;
  changed: boolean;
  detail: string;
  error: string | null;
}

export interface BridgeAlignResult {
  dryRun: boolean;
  items: BridgeAlignItem[];
  applied: number;
  unchanged: number;
  failed: number;
  statusesAdvanced: string[];
  errors: string[];
}

export interface BridgePublishItem {
  pageId: string;
  slug: string;
  route: string | null;
  title: string | null;
  status: string;
  /** Why it is a candidate: "never_published" | "draft_pending". */
  reason: string | null;
  liveUrl: string | null;
  error: string | null;
}

export interface BridgePublishResult {
  dryRun: boolean;
  requested: number;
  published: number;
  wouldPublish: number;
  skippedNoChanges: number;
  failed: number;
  /** Candidates beyond the per-call cap — re-run to continue. */
  remainingCandidates: number;
  items: BridgePublishItem[];
  statusesAdvanced: string[];
  warnings: string[];
  /** Post-publish structural inspection of what just went live (server-run). */
  shellCheck: ShellCheckSummary | null;
}

// ── rendered-shell inspection (aidream cms_verify/shell_check.py) ───────────

export type ShellIssue = components["schemas"]["ShellIssue"];

export interface ShellPageResult {
  pageId: string | null;
  route: string;
  url: string;
  stateChecked: string;
  httpStatus: number | null;
  ok: boolean;
  issues: ShellIssue[];
}

export interface ShellCheckSummary {
  site: string;
  pagesChecked: number;
  pagesPassed: number;
  siteIssues: { key: string; message: string; pagesAffected: number }[];
  pages: ShellPageResult[];
  truncationNote: string | null;
}

function parseShellCheck(value: unknown): ShellCheckSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const issues = (raw: unknown): ShellIssue[] =>
    Array.isArray(raw)
      ? raw.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as Record<string, unknown>;
          return [
            {
              key: String(row.key ?? ""),
              severity: row.severity === "site" ? "site" : "page",
              message: String(row.message ?? ""),
            } satisfies ShellIssue,
          ];
        })
      : [];
  return {
    site: String(data.site ?? ""),
    pagesChecked:
      typeof data.pages_checked === "number" ? data.pages_checked : 0,
    pagesPassed: typeof data.pages_passed === "number" ? data.pages_passed : 0,
    siteIssues: Array.isArray(data.site_issues)
      ? data.site_issues.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as Record<string, unknown>;
          return [
            {
              key: String(row.key ?? ""),
              message: String(row.message ?? ""),
              pagesAffected:
                typeof row.pages_affected === "number" ? row.pages_affected : 0,
            },
          ];
        })
      : [],
    pages: Array.isArray(data.pages)
      ? data.pages.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as Record<string, unknown>;
          return [
            {
              pageId: typeof row.page_id === "string" ? row.page_id : null,
              route: String(row.route ?? ""),
              url: String(row.url ?? ""),
              stateChecked: String(row.state_checked ?? ""),
              httpStatus:
                typeof row.http_status === "number" ? row.http_status : null,
              ok: row.ok === true,
              issues: issues(row.issues),
            } satisfies ShellPageResult,
          ];
        })
      : [],
    truncationNote:
      typeof data.truncation_note === "string" ? data.truncation_note : null,
  };
}

/**
 * Inspect the paired CMS site's RENDERED pages for the site-level defects
 * that make every page look broken (missing header/menu, footer, brand,
 * stylesheet) plus per-page basics. Deterministic server-side fetch+parse —
 * no browser, no model, safe to run any time.
 */
export async function bridgeShellCheck(
  dispatch: AppDispatch,
  siteId: string,
  options: { state?: string; limit?: number; routes?: string[] } = {},
): Promise<ShellCheckSummary> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/shell-check",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        state: options.state ?? "auto",
        limit: options.limit ?? 10,
        routes: options.routes ?? null,
      },
    }),
  );
  const parsed = parseShellCheck(requireBody(result, "shell-check"));
  if (!parsed)
    throw new Error("The shell check returned an unreadable result.");
  return parsed;
}

// ── the site-level pipeline (aidream content_plan/site_pipeline.py) ─────────

export type SiteStageState =
  "complete" | "in_progress" | "attention" | "not_started";

export interface SitePipelineStage {
  key: string;
  label: string;
  state: SiteStageState;
  done: number;
  total: number;
  detail: string;
  missing: string[];
}

export interface SitePipelineData {
  siteId: string;
  stages: SitePipelineStage[];
  pagesPlanned: number;
  cmsLinked: boolean;
  cmsSiteId: string | null;
  cmsSlug: string | null;
}

const STAGE_STATES: readonly SiteStageState[] = [
  "complete",
  "in_progress",
  "attention",
  "not_started",
];

/**
 * The site-level pipeline — the per-page rail's eight steps answered for the
 * whole site, derived server-side from live rows (never stamped).
 */
export async function fetchSitePipeline(
  dispatch: AppDispatch,
  siteId: string,
): Promise<SitePipelineData> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/pipeline",
      method: "GET",
      pathParams: { site_id: siteId },
    }),
  );
  const data = requireBody(result, "site pipeline");
  const stages: SitePipelineStage[] = Array.isArray(data.stages)
    ? data.stages.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const state = STAGE_STATES.includes(row.state as SiteStageState)
          ? (row.state as SiteStageState)
          : "not_started";
        return [
          {
            key: String(row.key ?? ""),
            label: String(row.label ?? ""),
            state,
            done: typeof row.done === "number" ? row.done : 0,
            total: typeof row.total === "number" ? row.total : 0,
            detail: String(row.detail ?? ""),
            missing: Array.isArray(row.missing) ? row.missing.map(String) : [],
          } satisfies SitePipelineStage,
        ];
      })
    : [];
  return {
    siteId: String(data.site_id ?? siteId),
    stages,
    pagesPlanned:
      typeof data.pages_planned === "number" ? data.pages_planned : 0,
    cmsLinked: data.cms_linked === true,
    cmsSiteId: typeof data.cms_site_id === "string" ? data.cms_site_id : null,
    cmsSlug: typeof data.cms_slug === "string" ? data.cms_slug : null,
  };
}

export interface FillPreviewResult {
  nodeId: string;
  pageId: string;
  route: string;
  title: string;
  html: string;
  css: string;
  metaTitle: string;
  metaDescription: string;
  model: string;
  wrote: boolean;
  globalCss: string;
  headerHtml: string;
  footerHtml: string;
}

/**
 * What a build is about to cost, priced from what these agents ACTUALLY charged
 * on their last runs. `usd === null` means "not enough history to say" — never a
 * guess dressed as a number. `calls` is always exact.
 */
export interface FillEstimate {
  pages: number;
  calls: number;
  callsByStep: Record<string, number>;
  usd: number | null;
  basis: string;
}

/**
 * One effort tier priced for THIS site, before the button. `calls` is exact;
 * `usd === null` means the steps have no measured history yet — never a guess.
 * Per-page overrides are honoured, so the row is the real job, not an average.
 */
export interface FillTierEstimate {
  tier: EffortTier;
  label: string;
  blurb: string;
  /** Pages this tier would newly govern (pages with their own override excluded). */
  pagesAtTier: number;
  estimate: FillEstimate;
}

export interface FillEffortEstimate {
  pages: number;
  /** The site's recorded default; null = it has never chosen one. */
  siteTier: EffortTier | null;
  defaultTier: EffortTier;
  /** Pages carrying their own override, counted by tier. */
  overrides: Record<string, number>;
  tiers: FillTierEstimate[];
}

export interface FillStartResult {
  jobId: string;
  /** Work ITEMS seeded (pages × steps), not pages. */
  seeded: number;
  steps: string[];
  estimate: FillEstimate;
  skipped: string[];
}

export interface FillProblem {
  route: string;
  step: string;
  stepLabel: string;
  status: string;
  attempts: number;
  error: string | null;
}

/** One per-page pipeline step's live queue counts — the "12 written, 4 reviewed,
 * 2 built" row. Derived server-side from queue state on every read. */
export interface FillStepCounts {
  step: string;
  label: string;
  total: number;
  pending: number;
  /** Waiting on an earlier step of the SAME page. */
  blocked: number;
  inProgress: number;
  succeeded: number;
  /** Deliberately not run (already done, or its input does not exist). */
  skipped: number;
  failed: number;
  deadLetter: number;
  costUsd: number | null;
}

export interface FillStatus {
  jobId: string | null;
  /** "none" = no fill job has ever run for this site. */
  status: string;
  /** ITEMS (pages × steps). Use `pages` for the page count. */
  total: number;
  pending: number;
  blocked: number;
  inProgress: number;
  succeeded: number;
  skipped: number;
  failed: number;
  deadLetter: number;
  pages: number;
  pagesBuilt: number;
  steps: FillStepCounts[];
  /** Actual spend so far; null = nothing has reported usage yet. */
  costUsd: number | null;
  estimate: FillEstimate | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  problems: FillProblem[];
}

export interface StarterKitOutcome {
  dryRun: boolean;
  operation: string;
  globalCssChars: number;
  navigationSeeded: boolean;
  componentCount: number;
  notes: string[];
}

/**
 * What the logo hunt found — or honestly did not. `found: false` is a NORMAL
 * outcome and carries `message` (what was tried) plus `rejected` (every
 * candidate we downloaded and why it lost), so the UI never shows a shrug.
 */
export interface FindLogoOutcome {
  found: boolean;
  message: string;
  assetId: string | null;
  assetUrl: string | null;
  /** og:image | twitter:image | apple-touch-icon | icon | msapplication-tile | image-search */
  source: string | null;
  sourceUrl: string | null;
  width: number | null;
  height: number | null;
  candidatesConsidered: number;
  rejected: string[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseReport(data: Record<string, unknown>): BridgeReport {
  const problems: string[] = [];
  const ghosts: BridgeGhost[] = [];
  const rawGhosts = Array.isArray(data.ghosts) ? data.ghosts : [];
  for (const row of rawGhosts) {
    if (row && typeof row === "object") {
      const record = row as Record<string, unknown>;
      const nodeId = str(record.node_id);
      if (nodeId) {
        ghosts.push({
          nodeId,
          route: str(record.route) || "/",
          label: str(record.label),
        });
        continue;
      }
    }
    problems.push(
      "A ghost row from the server had no node_id — it was skipped.",
    );
  }
  const count = (key: string): number =>
    Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0;
  return {
    cmsSiteId: str(data.cms_site_id),
    cmsSiteSlug: str(data.cms_site_slug),
    matched: count("matched"),
    ghosts,
    orphans: count("orphans"),
    conflicts: count("conflicts"),
    retired: count("retired"),
    linksWritten:
      typeof data.links_written === "number" ? data.links_written : 0,
    warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
    problems,
  };
}

function parseAlign(data: Record<string, unknown>): BridgeAlignResult {
  const items: BridgeAlignItem[] = [];
  for (const row of Array.isArray(data.items) ? data.items : []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    items.push({
      action: str(record.action),
      nodeId: str(record.node_id) || null,
      pageId: str(record.page_id) || null,
      ok: record.ok !== false,
      changed: record.changed === true,
      detail: str(record.detail),
      error: str(record.error) || null,
    });
  }
  return {
    dryRun: data.dry_run === true,
    items,
    applied: typeof data.applied === "number" ? data.applied : 0,
    unchanged: typeof data.unchanged === "number" ? data.unchanged : 0,
    failed: typeof data.failed === "number" ? data.failed : 0,
    statusesAdvanced: Array.isArray(data.statuses_advanced)
      ? data.statuses_advanced.map(String)
      : [],
    errors: Array.isArray(data.errors) ? data.errors.map(String) : [],
  };
}

function requireBody(
  result: ApiCallResult,
  what: string,
): Record<string, unknown> {
  if (result.error) {
    throw new Error(result.error.message || `The ${what} call failed.`);
  }
  if (!result.data || typeof result.data !== "object") {
    throw new Error(`The ${what} call returned no body.`);
  }
  return result.data as Record<string, unknown>;
}

/** One plan route and the `web.page` record that carries its SEO plan. */
export interface PlannedPageAnchor {
  route: string;
  url: string;
  webPageId: string;
}

export interface PlannedPagesResult {
  pages: PlannedPageAnchor[];
  /** Routes with no anchor, each with the server's reason. Never swallowed. */
  problems: string[];
}

/**
 * Ensure the `web.page` record that carries each route's SEO plan.
 *
 * Arman's ruling, 2026-08-16 (`common-docs/systems/marketing/content-planning/FEATURE.md`
 * invariant 9): one SEO plan per page, on `web.page`. This is the ONE way the
 * client gets such a row, and it is deliberately a server call rather than a
 * direct insert: the table's unique arbiter is `(site_id, url_hash)`, and
 * `url_hash` is the platform's one stored-identity digest — it lives in
 * `matrx_scraper.utils.url` and a TypeScript copy would be a second identity
 * rule for the arbiter that stops duplicate pages existing.
 *
 * Reading and WRITING the plan itself stays direct-to-Supabase, as always
 * (`updatePageDesiredValues`). Only minting the anchor comes through here.
 */
export async function ensurePlannedPages(
  dispatch: AppDispatch,
  siteId: string,
  routes: string[],
): Promise<PlannedPagesResult> {
  if (routes.length === 0) return { pages: [], problems: [] };
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/planned-pages",
      method: "POST",
      pathParams: { site_id: siteId },
      body: { routes },
    }),
  );
  const body = requireBody(result, "planned-pages");
  const rawPages = Array.isArray(body.pages) ? body.pages : [];
  const problems = Array.isArray(body.problems)
    ? body.problems.filter((p): p is string => typeof p === "string")
    : [];
  const pages: PlannedPageAnchor[] = [];
  for (const row of rawPages) {
    if (!row || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const route = typeof entry.route === "string" ? entry.route : "";
    const webPageId =
      typeof entry.web_page_id === "string" ? entry.web_page_id : "";
    if (!route || !webPageId) {
      problems.push(
        `A planned-page row came back without a route or page id: ${JSON.stringify(entry)}`,
      );
      continue;
    }
    pages.push({
      route,
      url: typeof entry.url === "string" ? entry.url : "",
      webPageId,
    });
  }
  return { pages, problems };
}

/** Diff the plan against its paired CMS site. `cmsSite` given once pairs them. */
export async function bridgeReconcile(
  dispatch: AppDispatch,
  siteId: string,
  options?: { cmsSite?: string },
): Promise<BridgeReport> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-reconcile",
      method: "POST",
      pathParams: { site_id: siteId },
      body: { cms_site: options?.cmsSite ?? null, write_links: true },
    }),
  );
  return parseReport(requireBody(result, "cms-reconcile"));
}

/** Realize ghost nodes as draft CMS pages. Dry-run first, always. */
export async function bridgeRealize(
  dispatch: AppDispatch,
  siteId: string,
  nodeIds: string[],
  options: { dryRun: boolean; cmsSite?: string },
): Promise<BridgeAlignResult> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-align",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        actions: nodeIds.map((nodeId) => ({
          action: "realize",
          node_id: nodeId,
        })),
        dry_run: options.dryRun,
      },
    }),
  );
  return parseAlign(requireBody(result, "cms-align"));
}

/**
 * Adopt live CMS pages the plan doesn't know about: creates the planned page
 * at each page's route and links it to the page already serving there.
 */
export async function bridgeAdopt(
  dispatch: AppDispatch,
  siteId: string,
  pageIds: string[],
  options: { dryRun: boolean; cmsSite?: string },
): Promise<BridgeAlignResult> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-align",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        actions: pageIds.map((pageId) => ({
          action: "adopt",
          page_id: pageId,
        })),
        dry_run: options.dryRun,
      },
    }),
  );
  return parseAlign(requireBody(result, "cms-align"));
}

/**
 * Resolve a route conflict between a plan node and the CMS page linked to it.
 * `plan_yields` rewrites the planned route to the live one; `cms_yields` moves
 * the page to the planned route — the server refuses that on a PUBLISHED page
 * unless `force`, and when forced it records the old route for a redirect.
 */
export async function bridgeResolveConflict(
  dispatch: AppDispatch,
  siteId: string,
  options: {
    nodeId: string;
    pageId: string;
    resolve: "plan_yields" | "cms_yields";
    force?: boolean;
    dryRun: boolean;
    cmsSite?: string;
  },
): Promise<BridgeAlignResult> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-align",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        actions: [
          {
            action: "map",
            node_id: options.nodeId,
            page_id: options.pageId,
            resolve: options.resolve,
            force: options.force ?? false,
          },
        ],
        dry_run: options.dryRun,
      },
    }),
  );
  return parseAlign(requireBody(result, "cms-align"));
}

function parsePublish(data: Record<string, unknown>): BridgePublishResult {
  const items: BridgePublishItem[] = [];
  for (const row of Array.isArray(data.results) ? data.results : []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    items.push({
      pageId: str(record.page_id),
      slug: str(record.slug),
      route: str(record.route) || null,
      title: str(record.title) || null,
      status: str(record.status),
      reason: str(record.reason) || null,
      liveUrl: str(record.live_url) || null,
      error: str(record.error_message) || null,
    });
  }
  const num = (key: string): number =>
    typeof data[key] === "number" ? (data[key] as number) : 0;
  return {
    dryRun: data.dry_run === true,
    requested: num("requested"),
    published: num("published"),
    wouldPublish: num("would_publish"),
    skippedNoChanges: num("skipped_no_changes"),
    failed: num("failed"),
    remainingCandidates: num("remaining_candidates"),
    items,
    statusesAdvanced: Array.isArray(data.statuses_advanced)
      ? data.statuses_advanced.map(String)
      : [],
    warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
    shellCheck: parseShellCheck(data.shell_check),
  };
}

/**
 * Bulk-publish the paired CMS site's pending pages. Dry-run returns the real
 * candidate list (what would publish and why); apply publishes through the
 * server's ONE per-page publish path with per-item failure isolation.
 */
export async function bridgePublish(
  dispatch: AppDispatch,
  siteId: string,
  options: { dryRun: boolean; cmsSite?: string; pageIds?: string[] },
): Promise<BridgePublishResult> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-publish",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        // Naming pages narrows the run to exactly those; omitted = every
        // pending page on the site (the Setup rung's whole-site publish).
        page_ids: options.pageIds ?? null,
        only_plan_linked: false,
        dry_run: options.dryRun,
        sync_status: true,
      },
    }),
  );
  return parsePublish(requireBody(result, "cms-publish"));
}

// ── fill drafts from briefs (the content-generation rung) ───────────────────

function nullableNum(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function parseFillEstimate(value: unknown): FillEstimate | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const callsByStep: Record<string, number> = {};
  const raw = record.calls_by_step;
  if (raw && typeof raw === "object") {
    for (const [step, count] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      if (typeof count === "number") callsByStep[step] = count;
    }
  }
  return {
    pages: typeof record.pages === "number" ? record.pages : 0,
    calls: typeof record.calls === "number" ? record.calls : 0,
    callsByStep,
    usd: nullableNum(record.usd),
    basis: str(record.basis),
  };
}

function parseFillSteps(value: unknown): FillStepCounts[] {
  const rows: FillStepCounts[] = [];
  for (const row of Array.isArray(value) ? value : []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const step = str(record.step);
    if (!step) continue;
    const num = (key: string): number =>
      typeof record[key] === "number" ? (record[key] as number) : 0;
    rows.push({
      step,
      label: str(record.label) || step,
      total: num("total"),
      pending: num("pending"),
      blocked: num("blocked"),
      inProgress: num("in_progress"),
      succeeded: num("succeeded"),
      skipped: num("skipped"),
      failed: num("failed"),
      deadLetter: num("dead_letter"),
      costUsd: nullableNum(record.cost_usd),
    });
  }
  return rows;
}

function parseFillStatus(data: Record<string, unknown>): FillStatus {
  const num = (key: string): number =>
    typeof data[key] === "number" ? (data[key] as number) : 0;
  const problems: FillProblem[] = [];
  for (const row of Array.isArray(data.problems) ? data.problems : []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const step = str(record.step);
    problems.push({
      route: str(record.route),
      step,
      stepLabel: str(record.step_label) || step,
      status: str(record.status),
      attempts: typeof record.attempts === "number" ? record.attempts : 0,
      error: str(record.error) || null,
    });
  }
  return {
    jobId: str(data.job_id) || null,
    status: str(data.status) || "none",
    total: num("total"),
    pending: num("pending"),
    blocked: num("blocked"),
    inProgress: num("in_progress"),
    succeeded: num("succeeded"),
    skipped: num("skipped"),
    failed: num("failed"),
    deadLetter: num("dead_letter"),
    pages: num("pages"),
    pagesBuilt: num("pages_built"),
    steps: parseFillSteps(data.steps),
    costUsd: nullableNum(data.cost_usd),
    estimate: parseFillEstimate(data.estimate),
    startedAt: str(data.started_at) || null,
    finishedAt: str(data.finished_at) || null,
    error: str(data.error) || null,
    problems,
  };
}

/**
 * Author ONE page from its brief and return it — the look before the fan-out.
 * A full LLM authoring pass takes minutes, so this STREAMS (the platform's
 * >1s rule): the result arrives as one `plan_cms_fill_preview` data event.
 */
export async function bridgeFillPreview(
  dispatch: AppDispatch,
  siteId: string,
  options: { cmsSite?: string; nodeId?: string; write?: boolean },
): Promise<FillPreviewResult> {
  let preview: FillPreviewResult | null = null;
  let streamError: string | null = null;
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-fill/preview",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        node_id: options.nodeId ?? null,
        write: options.write === true,
      },
      stream: true,
      onStreamEvent: (event) => {
        if (event.event === "error") {
          streamError = describeBackendFailure(
            parseStreamError(event.data),
          ).headline;
          return;
        }
        if (
          event.event !== "data" ||
          !event.data ||
          typeof event.data !== "object"
        ) {
          return;
        }
        const data = event.data as Record<string, unknown>;
        if (data.type !== "plan_cms_fill_preview") return;
        preview = {
          nodeId: str(data.node_id),
          pageId: str(data.page_id),
          route: str(data.route) || "/",
          title: str(data.title),
          html: str(data.html),
          css: str(data.css),
          metaTitle: str(data.meta_title),
          metaDescription: str(data.meta_description),
          model: str(data.model),
          wrote: data.wrote === true,
          globalCss: str(data.global_css),
          headerHtml: str(data.header_html),
          footerHtml: str(data.footer_html),
        };
      },
    }),
  );
  if (result.error) {
    throw new Error(
      result.error.message || "The cms-fill/preview call failed.",
    );
  }
  if (streamError) throw new Error(streamError);
  if (!preview) {
    throw new Error("The authoring stream ended without a preview payload.");
  }
  return preview;
}

/**
 * What every effort tier would cost for this site — the number Arman requires
 * BEFORE the button (a 300-page site knows its bill before the click). Read
 * only; it starts nothing and enforces nothing.
 */
/** Start the durable fill job (seeds the DB frontier, returns immediately). */
export async function bridgeFillStart(
  dispatch: AppDispatch,
  siteId: string,
  options: {
    cmsSite?: string;
    overwrite?: boolean;
    /** Omit = the whole per-page pipeline (family → write → review → build). */
    steps?: string[];
    /** The review/fact-check pass. ON unless explicitly turned off. */
    includeReview?: boolean;
    /**
     * The named effort tier for this run — a preset over `steps`, resolved per
     * page against the page's own override and the site default. Ignored when
     * `steps` is passed (that is the raw knob the preset sits on).
     */
    effortTier?: EffortTier | null;
    /**
     * Run only THESE plan nodes. Omit = every fillable linked draft on the
     * site, which is what the Setup rung does. This is how "run the rest of
     * the pipeline on the pages I picked" reaches the same durable queue as
     * the whole-site button — one engine, two selections, never a second path.
     */
    nodeIds?: string[];
    /**
     * Re-author pages that are ALREADY PUBLISHED, into their drafts (live
     * content is never touched). OFF by default so a whole-site run can never
     * start rewriting a live site as a side effect; a deliberate selection of
     * published pages turns it on.
     */
    includePublished?: boolean;
    /** Redo only these steps — the narrow grain of `overwrite`. */
    overwriteSteps?: string[];
  },
): Promise<FillStartResult> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-fill",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        steps: options.steps ?? null,
        include_review: options.includeReview !== false,
        effort_tier: options.effortTier ?? null,
        overwrite: options.overwrite === true,
        overwrite_steps: options.overwriteSteps ?? null,
        include_published: options.includePublished === true,
        node_ids: options.nodeIds ?? null,
      },
    }),
  );
  const data = requireBody(result, "cms-fill");
  return {
    jobId: str(data.job_id),
    seeded: typeof data.seeded === "number" ? data.seeded : 0,
    steps: Array.isArray(data.steps) ? data.steps.map(String) : [],
    estimate: parseFillEstimate(data.estimate) ?? {
      pages: 0,
      calls: 0,
      callsByStep: {},
      usd: null,
      basis: "",
    },
    skipped: Array.isArray(data.skipped) ? data.skipped.map(String) : [],
  };
}

/** Live progress — derived server-side from queue counts (restart-agnostic). */
export async function bridgeFillStatus(
  dispatch: AppDispatch,
  siteId: string,
): Promise<FillStatus> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-fill/status",
      method: "GET",
      pathParams: { site_id: siteId },
    }),
  );
  return parseFillStatus(requireBody(result, "cms-fill/status"));
}

/** Stop a running fill job (in-flight pages finish; nothing else is claimed). */
export async function bridgeFillCancel(
  dispatch: AppDispatch,
  siteId: string,
  jobId: string,
): Promise<FillStatus> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-fill/cancel",
      method: "POST",
      pathParams: { site_id: siteId },
      body: { job_id: jobId },
    }),
  );
  return parseFillStatus(requireBody(result, "cms-fill/cancel"));
}

/**
 * Find the company's real logo on the web and store it as a `logo`-tagged CMS
 * asset — the header picks it up on the next starter-kit run.
 *
 * Streams (the server reads the company's live homepage, then Brave's image
 * index, then downloads the winner), so the caller gets stage narration for
 * free; the terminal `cms_logo_found` event is the answer. A MISS arrives as a
 * successful stream with `found: false` — only a real failure throws.
 */
export async function bridgeFindLogo(
  dispatch: AppDispatch,
  siteId: string,
  options: { cmsSite?: string } = {},
): Promise<FindLogoOutcome> {
  let outcome: FindLogoOutcome | null = null;
  let streamError: string | null = null;
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/find-logo",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        company_name: null,
        domain: null,
      },
      stream: true,
      onStreamEvent: (event) => {
        if (event.event === "error") {
          streamError = describeBackendFailure(
            parseStreamError(event.data),
          ).headline;
          return;
        }
        if (event.event !== "data" || !isJsonObject(event.data)) {
          return;
        }
        const data = event.data;
        if (data.type !== "cms_logo_found") return;
        outcome = {
          found: data.found === true,
          message: str(data.message),
          assetId: str(data.asset_id) || null,
          assetUrl: str(data.asset_url) || null,
          source: str(data.source) || null,
          sourceUrl: str(data.source_url) || null,
          width: typeof data.width === "number" ? data.width : null,
          height: typeof data.height === "number" ? data.height : null,
          candidatesConsidered:
            typeof data.candidates_considered === "number"
              ? data.candidates_considered
              : 0,
          rejected: Array.isArray(data.rejected)
            ? data.rejected.map(String)
            : [],
        };
      },
    }),
  );
  if (result.error) {
    throw new Error(result.error.message || "The find-logo call failed.");
  }
  if (streamError) throw new Error(streamError);
  if (!outcome) {
    throw new Error("The logo search ended without a result payload.");
  }
  return outcome;
}

/** Seed the paired CMS site's shell (global CSS + header/footer + nav). */
export async function bridgeStarterKit(
  dispatch: AppDispatch,
  siteId: string,
  options: { force: boolean; dryRun: boolean; cmsSite?: string },
): Promise<StarterKitOutcome> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-starter-kit",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        force: options.force,
        dry_run: options.dryRun,
      },
    }),
  );
  const data = requireBody(result, "cms-starter-kit");
  return {
    dryRun: data.dry_run === true,
    operation: str(data.operation),
    globalCssChars:
      typeof data.global_css_chars === "number" ? data.global_css_chars : 0,
    navigationSeeded: data.navigation_seeded === true,
    componentCount: Array.isArray(data.components) ? data.components.length : 0,
    notes: Array.isArray(data.notes) ? data.notes.map(String) : [],
  };
}

/**
 * Create this plan site's CMS counterpart and record the link on BOTH sides —
 * `web.site.settings.cms` here, and `client_sites.web_site_id` through the
 * first reconcile.
 *
 * ONE implementation, two entry points: the guided setup checklist's "Set it
 * up for me" step (which only ever creates) and the "Make it real" rung (which
 * ALSO offers linking a website that already exists — a choice only a human can
 * make, so it stays there).
 */
export async function createAndLinkCmsSite(
  dispatch: AppDispatch,
  site: {
    id: string;
    name: string;
    domain: string | null;
    organization_id?: string | null;
  },
): Promise<{ cmsSiteId: string; cmsSlug: string }> {
  const slug =
    slugify(normalizeDomain(site.domain).replace(/\./g, "-")) ||
    slugify(site.name);
  if (!slug) {
    throw new Error(
      "This site has neither a name nor a web address we can build a website from.",
    );
  }
  const created = await CmsSiteService.createSite({
    name: site.name,
    slug,
    domain: normalizeDomain(site.domain) || undefined,
    // The rungs below (starter kit, realize) write through aidream's guarded
    // seams, where an unset agent_write_policy means BLOCKED.
    settings: { agent_write_policy: "full" },
    // The CMS site inherits the org of the web.site it realizes — the whole
    // point of the pairing. Without this the marketing site is org-visible and
    // its own CMS counterpart is not, which is the exact split that made
    // `resolveCmsLink` refuse for teammates (CMS migration 0039).
    organizationId: site.organization_id ?? null,
  });
  // FRESH row, not a query cache copy: Setup's draft autosaves bump `version`
  // continuously, so a cached version deterministically fails the guard.
  const fresh = await fetchFreshSite(site.id);
  await recordCmsLink({
    siteId: site.id,
    expectedVersion: fresh.version,
    currentSettings: fresh.settings,
    cmsSiteId: created.id,
    cmsSlug: created.slug,
  });
  await bridgeReconcile(dispatch, site.id, { cmsSite: created.id });
  return { cmsSiteId: created.id, cmsSlug: created.slug };
}

// ── node→page map (WF-11: the plan workspace's CMS-page overlay) ────────────

export interface CmsPageMapEntry {
  pageId: string;
  planNodeId: string | null;
  route: string | null;
  title: string;
  isPublished: boolean;
  hasDraft: boolean;
  isHomePage: boolean;
  liveUrl: string | null;
  previewUrl: string | null;
  /** `plan_excluded_at` — a human declared this page not part of the plan. */
  planExcludedAt: string | null;
  /**
   * `client_pages.web_page_id` (CMS migration 0037) — the MEASURED `web.page`
   * this CMS page serves. THE AFTER door: with it, a plan row can open the
   * page's measurement without first reading the full CMS row. `null` means
   * the publish→crawl join has not landed yet, which is an honest hidden
   * state, never an error (`docs/handoffs/cms-page-hub.md` item 6).
   */
  webPageId: string | null;
}

export interface CmsPageMap {
  cmsSiteId: string;
  cmsSiteSlug: string;
  pages: CmsPageMapEntry[];
  warnings: string[];
}

/**
 * The paired CMS site's pages (summary rows) so the plan UI can show what
 * each node became. Returns null when the plan site has no paired CMS site —
 * a normal state for a plan that hasn't reached the "Make it real" rungs,
 * never an error.
 */
export async function bridgeCmsPages(
  dispatch: AppDispatch,
  siteId: string,
  cmsSite: string,
): Promise<CmsPageMap | null> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-pages",
      method: "GET",
      pathParams: { site_id: siteId },
      // The plan resolver already proved this exact CMS choice. Omitting it
      // makes a half-linked site fail even though settings.cms records the id.
      queryParams: { cms_site: cmsSite },
    }),
  );
  if (result.error) {
    const message = result.error.message || "";
    throw new Error(message || "The cms-pages call failed.");
  }
  const data = requireBody(result, "cms-pages");
  const pages: CmsPageMapEntry[] = [];
  for (const row of Array.isArray(data.pages) ? data.pages : []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const pageId = str(record.id);
    if (!pageId) continue;
    pages.push({
      pageId,
      planNodeId: str(record.plan_node_id) || null,
      route: str(record.route) || null,
      title: str(record.title),
      isPublished: record.is_published === true,
      hasDraft: record.has_draft === true,
      isHomePage: record.is_home_page === true,
      liveUrl: str(record.live_url) || null,
      previewUrl: str(record.preview_url) || null,
      planExcludedAt: str(record.plan_excluded_at) || null,
      webPageId: str(record.web_page_id) || null,
    });
  }
  return {
    cmsSiteId: str(data.cms_site_id),
    cmsSiteSlug: str(data.cms_site_slug),
    pages,
    warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
  };
}

// ── the plan-side half of "link": web.site.settings.cms ─────────────────────

/**
 * Record the CMS counterpart on the plan-side site so `resolveCmsLink` (and
 * every other reader of `settings.cms`) sees it. Same merge + version-guard
 * discipline as `recordSiteArchetype` — a concurrent settings edit fails
 * LOUDLY instead of losing keys. The CMS-side half of the pairing
 * (`client_sites.web_site_id`) is written by `bridgeReconcile({cmsSite})`.
 */
export async function recordCmsLink(args: {
  siteId: string;
  expectedVersion: number;
  currentSettings: unknown;
  cmsSiteId: string;
  cmsSlug: string;
}): Promise<void> {
  const settings =
    args.currentSettings && typeof args.currentSettings === "object"
      ? { ...(args.currentSettings as Record<string, unknown>) }
      : {};
  const block =
    settings.cms && typeof settings.cms === "object"
      ? { ...(settings.cms as Record<string, unknown>) }
      : {};
  block.site_id = args.cmsSiteId;
  block.slug = args.cmsSlug;
  settings.cms = block;

  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("site")
    .update({ settings })
    .eq("id", args.siteId)
    .eq("version", args.expectedVersion)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) {
    throw new Error(
      "The site record changed in another session — the CMS site exists but the link was not recorded. Refresh and link again.",
    );
  }
}
