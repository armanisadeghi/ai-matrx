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
