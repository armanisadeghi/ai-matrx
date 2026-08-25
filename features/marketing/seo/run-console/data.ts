/**
 * The Run Console — data layer.
 *
 * Two reads and two writes, all client-direct to Supabase under RLS. Nothing
 * here re-derives coverage: per-site placement status is the EXISTING
 * `seo.topic_placement_status` read the topics screen already renders
 * (`../value-system/topics/data.ts` → `getTopicPlacementStatus`), because a
 * console that computed its own number would be the second truth this feature
 * exists to prevent.
 *
 * The run itself is NOT here — it goes straight to the deployed aidream
 * command through `useSeoCommandRun`, exactly as the topics strip does. A
 * Next.js API route between the browser and Python is banned.
 */

import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData, extractErrorMessage } from "@/utils/errors";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type { Database } from "@/types/database.types";
import {
  evaluateConditionMatchers,
  parseAutonomyVerdict,
} from "@/features/marketing/search-console/data-dig";
import type {
  ConsoleSiteRow,
  EngineScheduleRow,
  RunConsoleScope,
  ScheduleTier,
  SituationalRefreshStatus,
  SituationalRunOutcome,
} from "./types";

const assertData = makeAssertData("reach the run console");

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

/**
 * The brands this mount governs.
 *
 * The tier narrows the QUERY, and RLS is still the ceiling behind it — an
 * organization operator asking for every site gets their own rows either way.
 * `readAllRows` because the console treats this list as complete: a brand
 * missing from the picker is a brand that silently never runs.
 */
export async function listConsoleSites(
  scope: RunConsoleScope,
): Promise<ConsoleSiteRow[]> {
  const db = await authenticatedWebDb(supabase);
  const rows = await readAllRows<ConsoleSiteRow>(
    ({ from, to }) => {
      let query = db
        .from("site")
        .select("id, name, domain, brand_id, organization_id", {
          count: "exact",
        })
        .is("deleted_at", null)
        .eq("status", "active");
      if (scope.tier === "organization") {
        query = query.eq("organization_id", scope.organizationId);
      }
      if (scope.tier === "site") {
        query = query.eq("id", scope.siteId);
      }
      // Unique tail on the sort — a paginated ORDER BY that is not unique can
      // repeat and skip rows between requests.
      return query
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
    },
    { label: "web.site (run console)" },
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    brand_id: row.brand_id,
    organization_id: row.organization_id,
  }));
}

/**
 * Every live schedule for one engine, across all three tiers.
 *
 * The console reads ALL of them, not just its own tier, because the cascade is
 * the point: an organization operator must be able to see that the system
 * default exists and that their row overrides it. Reading only your own tier
 * is how "why did nothing change?" happens.
 */
export async function listEngineSchedules(
  engineSlug: string,
): Promise<EngineScheduleRow[]> {
  const db = await seoDb();
  const response = await db
    .from("engine_schedule")
    .select("*")
    .eq("engine_slug", engineSlug)
    .is("deleted_at", null)
    .order("scope_tier", { ascending: true });
  return assertData(
    response.data,
    response.error,
    "read the schedules",
  ) as EngineScheduleRow[];
}

/**
 * THE CASCADE — read from the DATABASE, never re-implemented here.
 *
 * Nearest wins: site > organization > system. Arman: "what I put applies only
 * to companies that don't have their own schedule in."
 *
 * 🚨 This used to be a local `.find()` chain, and the dispatcher
 * (`seo.engine_schedules_claim`) needed the same rule server-side. Two copies of
 * a rule that decides which brands get charged is how a console ends up SHOWING
 * one schedule while the dispatcher RUNS another. `seo.engine_schedule_resolve`
 * is the one implementation; this function is a thin read of it, and the
 * dispatcher reads the very same function. Never restore a local copy.
 *
 * Invoker-rights on purpose — RLS still bounds what an operator sees.
 */
export type ResolvedSchedule =
  Database["seo"]["Functions"]["engine_schedule_resolve"]["Returns"][number];

export async function resolveSchedulesForSites(
  engineSlug: string,
  siteIds: readonly string[],
): Promise<Map<string, ResolvedSchedule>> {
  if (siteIds.length === 0) return new Map();
  const db = await seoDb();
  const response = await db.rpc("engine_schedule_resolve", {
    p_engine_slug: engineSlug,
    p_site_ids: [...siteIds],
  });
  const rows = assertData(
    response.data,
    response.error,
    "resolve the schedule cascade",
  );
  return new Map(rows.map((row) => [row.site_id, row]));
}

export interface ScheduleDraft {
  engineSlug: string;
  tier: ScheduleTier;
  /** Required when tier is `organization`. */
  scopeOrganizationId: string | null;
  /** Required when tier is `site`. */
  siteId: string | null;
  cadence: string;
  runAtUtc: string | null;
  dayOfWeek: number | null;
  maxKeywordsPerRun: number;
  sitesPerRun: number;
  enabled: boolean;
  notes: string | null;
  /**
   * THE ORG LAW: every write carries an explicit organization_id and the
   * database never chooses one. A system-tier row is owned by the Matrx System
   * organization; an organization-tier row by that organization; a site-tier
   * row by the site's own organization.
   */
  organizationId: string;
}

export async function saveEngineSchedule(
  draft: ScheduleDraft,
  existingId: string | null,
): Promise<EngineScheduleRow> {
  const db = await seoDb();
  const payload = {
    engine_slug: draft.engineSlug,
    scope_tier: draft.tier,
    scope_organization_id: draft.scopeOrganizationId,
    site_id: draft.siteId,
    cadence: draft.cadence,
    run_at_utc: draft.runAtUtc,
    day_of_week: draft.dayOfWeek,
    max_keywords_per_run: draft.maxKeywordsPerRun,
    sites_per_run: draft.sitesPerRun,
    enabled: draft.enabled,
    notes: draft.notes,
    organization_id: draft.organizationId,
  };
  const response = existingId
    ? await db
        .from("engine_schedule")
        .update(payload)
        .eq("id", existingId)
        .select("*")
        .single()
    : await db.from("engine_schedule").insert(payload).select("*").single();
  return assertData(
    response.data,
    response.error,
    "save the schedule",
  ) as EngineScheduleRow;
}

/** Soft delete — the row is retired, never destroyed. */
export async function retireEngineSchedule(id: string): Promise<void> {
  const db = await seoDb();
  const response = await db
    .from("engine_schedule")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .single();
  assertData(response.data, response.error, "retire the schedule");
}

/* ─────────────────────────── WHAT THE AI DECIDED ───────────────────────────

   An admin console that shows counts and hides decisions is useless for the
   one job it exists for: judging whether the machine is any good. These rows
   ARE the run — one per keyword the assigner touched, with the Offering it
   chose, how sure it was, and what else it considered. Read from the durable
   placement rows rather than the stream, so the analysis survives a reload,
   a refresh, and tomorrow.
   ------------------------------------------------------------------------- */

export interface RunPlacementRow {
  keywordId: string;
  phrase: string;
  /** The Offering the assigner chose. */
  offering: string;
  /** Everything else it thought applied, in its own order. */
  secondary: string[];
  /** 0–100, the assigner's own number. Null when a human placed it. */
  confidence: number | null;
  /** `human` once confirmed; the assigner version otherwise. */
  decidedBy: string;
  /** Below the site's confidence floor ⇒ it is a proposal, not a ruling. */
  proposal: boolean;
  appliedAt: string | null;
}

/**
 * Every placement made on this site since `sinceIso` (defaults to the last
 * hour), newest first. `p_confidence_floor` is the site's own knob — a row
 * under it is a proposal awaiting a human, which is exactly the distinction
 * an operator is trying to see.
 */
export async function listRunPlacements(
  siteId: string,
  sinceIso: string,
  confidenceFloor: number,
  signal?: AbortSignal,
): Promise<RunPlacementRow[]> {
  const db = await seoDb();
  const { data, error } = await db
    .from("keyword_topic")
    .select(
      "keyword_id, confidence, assigned_by, is_primary, metadata, updated_at, keyword:keyword_id(phrase), topic:topic_id(name)",
    )
    .gte("updated_at", sinceIso)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500)
    .abortSignal(signal ?? new AbortController().signal)
    .returns<
      Array<{
        keyword_id: string;
        confidence: number | null;
        assigned_by: string | null;
        is_primary: boolean;
        metadata: Record<string, unknown> | null;
        updated_at: string;
        keyword: { phrase: string } | null;
        topic: { name: string } | null;
      }>
    >();
  if (error) throw new Error(extractErrorMessage(error));

  // One row per keyword: the primary is the ruling, the rest are what else it
  // considered. A keyword with no primary row is still worth showing — the
  // assigner reached it and chose only secondaries, which is a finding.
  const byKeyword = new Map<string, RunPlacementRow>();
  const secondaries = new Map<string, string[]>();
  for (const row of data ?? []) {
    const phrase = row.keyword?.phrase ?? row.keyword_id;
    const topic = row.topic?.name ?? "—";
    if (!row.is_primary) {
      secondaries.set(row.keyword_id, [
        ...(secondaries.get(row.keyword_id) ?? []),
        topic,
      ]);
      continue;
    }
    const placement =
      (row.metadata?.placement as Record<string, unknown> | undefined) ??
      undefined;
    const confidence =
      typeof row.confidence === "number" ? row.confidence : null;
    byKeyword.set(row.keyword_id, {
      keywordId: row.keyword_id,
      phrase,
      offering: topic,
      secondary: [],
      confidence,
      decidedBy: row.assigned_by ?? "unknown",
      proposal:
        row.assigned_by !== "human" &&
        confidence !== null &&
        confidence < confidenceFloor,
      appliedAt:
        typeof placement?.applied_at === "string"
          ? placement.applied_at
          : row.updated_at,
    });
  }
  for (const [keywordId, list] of secondaries) {
    const row = byKeyword.get(keywordId);
    if (row) row.secondary = list;
  }
  return [...byKeyword.values()];
}

/* ───────────────────────────────────────────────────────────────────────────
 * KI-016 — the situational refresh engine's reads and its run.
 *
 * 🚨 THE RUN IS NOT NEW CODE. `evaluateConditionMatchers`
 * (`features/marketing/search-console/data-dig.ts`) is the ONE client wrapper
 * over `seo.fn_evaluate_condition_matchers`, and it is what the Dig Here stamp
 * strip and the Dimensions screen's Re-evaluate button already press. The
 * console presses the SAME thing — a console with its own copy of the engine
 * call would drift from the button a person uses, which is the whole class of
 * defect this feature exists to prevent.
 * ─────────────────────────────────────────────────────────────────────────── */

/** One brand's situational standing — the read the console's table sorts on. */
export async function getSituationalRefreshStatus(
  siteId: string,
  signal?: AbortSignal,
): Promise<SituationalRefreshStatus> {
  const db = await seoDb();
  const response = await db
    .rpc("situational_refresh_status", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(
    response.data,
    response.error,
    "read this brand's situational segments",
  );
  const row = rows[0];
  // A brand with no condition matchers returns no row at all — that is a real
  // and common state (most brands have never written a Dig Here rule), so it
  // renders as zeroes, never as an error.
  return row
    ? {
        ...row,
        autonomy: parseAutonomyVerdict(row.autonomy),
      }
    : {
        site_id: siteId,
        matchers: 0,
        stale_matchers: 0,
        oldest_evaluated_at: null,
        newest_evaluated_at: null,
        stamps: 0,
        stale_after_hours: 0,
        autonomy: null,
      };
}

/** One refresh pass over one brand, through the ONE engine wrapper. */
export async function runSituationalRefresh(
  site: ConsoleSiteRow,
): Promise<SituationalRunOutcome> {
  const started = new Date().toISOString();
  try {
    const result = await evaluateConditionMatchers(site.id);
    const segments = (result.results ?? []).map((row) => ({
      matcherId: row.matcher_id,
      rule: row.rule ?? "—",
      dimension: row.dimension ?? "—",
      value: row.value ?? "—",
      matched: row.matched ?? 0,
      stamped: row.stamped ?? 0,
      removed: row.removed ?? 0,
      proposed: Number(
        (row as { proposed?: { keywords?: number } }).proposed?.keywords ?? 0,
      ),
      error: row.error ?? null,
    }));
    return {
      siteId: site.id,
      siteName: site.name,
      finishedAt: new Date().toISOString(),
      window: result.window
        ? { start: result.window.start, end: result.window.end }
        : null,
      matchers: result.matchers ?? 0,
      stamped: result.stamped ?? 0,
      removed: result.removed ?? 0,
      remaining: result.remaining ?? 0,
      passes: result.passes ?? 1,
      refusal: result.autonomy?.refusal ?? null,
      autonomyMode: result.autonomy?.mode ?? null,
      proposals: segments.reduce(
        (sum, row) => sum + (row.proposed > 0 ? 1 : 0),
        0,
      ),
      timeoutApplied: result.timeout_pass?.applied ?? 0,
      error: null,
      segments,
    };
  } catch (error) {
    // A failed brand is reported, never swallowed, and never ends the queue.
    return {
      siteId: site.id,
      siteName: site.name,
      finishedAt: started,
      window: null,
      matchers: 0,
      stamped: 0,
      removed: 0,
      remaining: 0,
      passes: 0,
      refusal: null,
      autonomyMode: null,
      proposals: 0,
      timeoutApplied: 0,
      error: extractErrorMessage(error),
      segments: [],
    };
  }
}
