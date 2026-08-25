/**
 * features/marketing/seo/run-console/history.ts
 *
 * 🚨 AN AUTOMATED RUN YOU CANNOT INSPECT CANNOT BE APPROVED.
 *
 * Arman, 2026-08-25: "especially the automated things that are being scheduled
 * and running in the background. if it's secretive things, then I can't approve
 * them." The dispatcher is deliberately unbuilt until he can audit passes — and
 * this is what makes that audit possible.
 *
 * Every pass, manual or scheduled, writes a durable row to `seo.collection_run`
 * carrying its whole result document and how it was triggered. So the history
 * is not something the console has to remember: it is something the console can
 * ASK for, days later, for a run nobody watched.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage } from "@/utils/errors";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

/** How a pass started. `on_demand` = a human pressed play; anything else ran itself. */
export type RunTrigger = "on_demand" | "scheduled" | string;

export interface EngineRunRow {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  trigger: RunTrigger;
  /** True when nobody was watching — the runs that must be auditable. */
  automated: boolean;
  siteId: string | null;
  territory: string | null;
  claimed: number;
  placed: number;
  proposed: number;
  quarantined: number;
  humanProtected: number;
  ceilingReached: boolean;
  error: string | null;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/**
 * Every pass this engine has run, newest first — across all brands, or one.
 * Deliberately NOT filtered to "today": the point is to look back at what ran
 * unattended.
 */
export async function listEngineRuns(
  operation: string,
  options: { siteId?: string; limit?: number } = {},
): Promise<EngineRunRow[]> {
  const db = await seoDb();
  const { data, error } = await db
    .from("collection_run")
    .select(
      "id, created_at, completed_at, status, trigger, site_id, result, error",
    )
    .eq("operation", operation)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100)
    .returns<
      Array<{
        id: string;
        created_at: string;
        completed_at: string | null;
        status: string;
        trigger: string | null;
        site_id: string | null;
        result: Record<string, unknown> | null;
        error: unknown;
      }>
    >();
  if (error) throw new Error(extractErrorMessage(error));

  return (data ?? [])
    .map((row) => {
      const result = row.result ?? {};
      // The run row's own site_id is not always populated; the result document
      // always names the site it acted on, so it is the reliable source.
      const siteId =
        typeof result.site_id === "string" ? result.site_id : row.site_id;
      const trigger = row.trigger ?? "unknown";
      return {
        runId: row.id,
        startedAt: row.created_at,
        finishedAt: row.completed_at,
        status: row.status,
        trigger,
        automated: trigger !== "on_demand",
        siteId,
        territory:
          typeof result.territory === "string" ? result.territory : null,
        claimed: num(result.claimed),
        placed: num(result.placed),
        proposed: num(result.proposed),
        quarantined: num(result.quarantined),
        humanProtected: num(result.human_protected),
        ceilingReached: result.ceiling_reached === true,
        error:
          typeof result.error === "string"
            ? result.error
            : row.error
              ? extractErrorMessage(row.error)
              : null,
      };
    })
    .filter((row) => !options.siteId || row.siteId === options.siteId);
}
