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
import { makeAssertData } from "@/utils/errors";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type {
  ConsoleSiteRow,
  EngineScheduleRow,
  RunConsoleScope,
  ScheduleTier,
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
 * THE CASCADE, in one function: site > organization > system.
 *
 * Nearest wins. The system row applies only where nothing closer exists —
 * Arman: "what I put applies only to companies that don't have their own
 * schedule in."
 */
export function resolveScheduleForSite(
  schedules: readonly EngineScheduleRow[],
  site: { id: string; organization_id: string },
): EngineScheduleRow | null {
  return (
    schedules.find((row) => row.scope_tier === "site" && row.site_id === site.id) ??
    schedules.find(
      (row) =>
        row.scope_tier === "organization" &&
        row.scope_organization_id === site.organization_id,
    ) ??
    schedules.find((row) => row.scope_tier === "system") ??
    null
  );
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
