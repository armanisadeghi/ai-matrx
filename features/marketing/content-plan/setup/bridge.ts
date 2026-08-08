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
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import type { AppDispatch } from "@/lib/redux/store";

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

export interface FillStartResult {
  jobId: string;
  seeded: number;
  skipped: string[];
}

export interface FillProblem {
  route: string;
  status: string;
  attempts: number;
  error: string | null;
}

export interface FillStatus {
  jobId: string | null;
  /** "none" = no fill job has ever run for this site. */
  status: string;
  total: number;
  pending: number;
  inProgress: number;
  succeeded: number;
  failed: number;
  deadLetter: number;
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
    problems.push("A ghost row from the server had no node_id — it was skipped.");
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
    linksWritten: typeof data.links_written === "number" ? data.links_written : 0,
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
        actions: nodeIds.map((nodeId) => ({ action: "realize", node_id: nodeId })),
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
  options: { dryRun: boolean; cmsSite?: string },
): Promise<BridgePublishResult> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-publish",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        only_plan_linked: false,
        dry_run: options.dryRun,
        sync_status: true,
      },
    }),
  );
  return parsePublish(requireBody(result, "cms-publish"));
}

// ── fill drafts from briefs (the content-generation rung) ───────────────────

function parseFillStatus(data: Record<string, unknown>): FillStatus {
  const num = (key: string): number =>
    typeof data[key] === "number" ? (data[key] as number) : 0;
  const problems: FillProblem[] = [];
  for (const row of Array.isArray(data.problems) ? data.problems : []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    problems.push({
      route: str(record.route),
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
    inProgress: num("in_progress"),
    succeeded: num("succeeded"),
    failed: num("failed"),
    deadLetter: num("dead_letter"),
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
          streamError = describeBackendFailure(parseStreamError(event.data)).headline;
          return;
        }
        if (event.event !== "data" || !event.data || typeof event.data !== "object") {
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
    throw new Error(result.error.message || "The cms-fill/preview call failed.");
  }
  if (streamError) throw new Error(streamError);
  if (!preview) {
    throw new Error("The authoring stream ended without a preview payload.");
  }
  return preview;
}

/** Start the durable fill job (seeds the DB frontier, returns immediately). */
export async function bridgeFillStart(
  dispatch: AppDispatch,
  siteId: string,
  options: { cmsSite?: string; overwrite?: boolean },
): Promise<FillStartResult> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-fill",
      method: "POST",
      pathParams: { site_id: siteId },
      body: {
        cms_site: options.cmsSite ?? null,
        overwrite: options.overwrite === true,
      },
    }),
  );
  const data = requireBody(result, "cms-fill");
  return {
    jobId: str(data.job_id),
    seeded: typeof data.seeded === "number" ? data.seeded : 0,
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
): Promise<CmsPageMap | null> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/sites/{site_id}/cms-pages",
      method: "GET",
      pathParams: { site_id: siteId },
    }),
  );
  if (result.error) {
    const message = result.error.message || "";
    if (/unpaired|no cms site/i.test(message)) return null;
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

  const response = await (await authenticatedWebDb(supabase))
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
