"use client";

/**
 * Derived collection status for one managed site — the data half of the
 * settings page's "Where this site's data comes from" table.
 *
 * Every status here is DERIVED from live evidence (provider bindings, the
 * `seo.collection_run` ledger, tracked rank targets), never a stamped string:
 * the panel this replaced called Backlinks "not connected" while it held 274
 * rows, because it trusted a flag that meant something else.
 *
 * Lives beside the data layer rather than inside the panel so the settings
 * surface can expose the same rows to agents without a second query.
 */

import { useQuery } from "@tanstack/react-query";

import { callApi } from "@/lib/api/call-api";
import {
  describeBackendFailure,
  parsePersistedBackendError,
  type BackendFailureExplanation,
} from "@/lib/api/errors";
import { useAppDispatch } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  collectionProviderSpec,
  type CollectionDoor,
  type CollectionProviderSpec,
} from "@/features/marketing/data/collection-providers";
import {
  getLatestCollectionRunsBySite,
  type CollectionRunSummary,
  type ProviderRunHistory,
} from "@/features/marketing/data/collection-runs";
import {
  parseSiteIntegrations,
  type SiteIntegrationsDraft,
} from "@/features/marketing/data/integrations-schema";
import { siteHasActiveBingBinding } from "@/features/marketing/bing/binding";
import type { MarketingSite } from "@/features/marketing/types";

const SCHEDULE_STATUS_PATH = "/seo/sites/{site_id}/schedule-status";

interface ProviderScheduleStatus {
  provider: string;
  label: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_success_at: string | null;
  row_count: number | null;
  next_due_at: string | null;
  next_due_reason: string | null;
}

interface SiteScheduleStatusResponse {
  site_id: string;
  generated_at: string;
  providers: ProviderScheduleStatus[];
}

/** The four states a source can be in. Ordered worst-first for sorting. */
type CollectionHealth =
  | "failing"
  | "not_connected"
  | "never_run"
  | "connected";

const HEALTH_LABEL: Record<CollectionHealth, string> = {
  failing: "Failing",
  not_connected: "Not connected",
  never_run: "No data yet",
  connected: "Connected",
};

export interface CollectionStatusRow {
  key: string;
  spec: CollectionProviderSpec | null;
  label: string;
  what: string;
  health: CollectionHealth;
  healthLabel: string;
  /** Plain-English sentence explaining the status — no jargon, no template. */
  healthDetail: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastSuccessAt: string | null;
  rowCount: number | null;
  rowUnit: string;
  scheduleLabel: string;
  scheduleDetail: string;
  failure: BackendFailureExplanation | null;
  failedRun: CollectionRunSummary | null;
  fix: CollectionDoor | null;
  data: CollectionDoor | null;
  runnable: boolean;
  trackedTargets: number | null;
}

function bindingEnabled(
  key: string,
  integrations: SiteIntegrationsDraft,
  rawIntegrations: unknown,
  serverEnabled: boolean,
): boolean {
  switch (key) {
    case "gsc":
      return integrations.googleSearchConsole.enabled;
    case "ga4":
      return integrations.googleAnalytics4.enabled;
    case "pagespeed_insights":
      return integrations.pageSpeedInsights.enabled;
    case "bing_webmaster":
      return siteHasActiveBingBinding(rawIntegrations);
    default:
      return serverEnabled;
  }
}

/**
 * Tracked rank targets are what "connected" means for rank providers — there
 * is no per-provider credential binding on the site for them, so the old
 * panel's permanent "not connected" chip was reading a flag nobody writes.
 */
async function countActiveRankTargets(
  siteId: string,
  signal?: AbortSignal,
): Promise<number> {
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("rank_target")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  return response.count ?? 0;
}

function buildRows(
  providers: ProviderScheduleStatus[],
  runHistory: Record<string, ProviderRunHistory>,
  trackedTargets: number,
  site: MarketingSite,
  sitePath: string,
): CollectionStatusRow[] {
  const integrations = parseSiteIntegrations(site.integrations);
  const doorContext = { siteId: site.id, sitePath };

  return providers.map((provider) => {
    const spec = collectionProviderSpec(provider.provider);
    const history = runHistory[provider.provider] ?? null;
    const latest = history?.latest ?? null;
    const isRankProvider =
      provider.provider === "brave" || provider.provider === "serpapi";
    const hasEvidence =
      (provider.row_count ?? 0) > 0 || Boolean(provider.last_success_at);

    const connected = isRankProvider
      ? trackedTargets > 0
      : provider.provider === "dataforseo"
        ? // A backlink credential proves itself by having collected. The
          // site-level `enabled` flag only governs the SCHEDULE.
          hasEvidence || provider.enabled
        : bindingEnabled(
            provider.provider,
            integrations,
            site.integrations,
            provider.enabled,
          );

    const failed = latest?.status === "failed";
    const persisted =
      failed && latest
        ? parsePersistedBackendError(latest.error, latest.request_id ?? "")
        : null;
    const failure = failed
      ? describeBackendFailure(
          persisted ??
            new Error("The last attempt failed without a recorded cause."),
        )
      : null;

    const health: CollectionHealth = failed
      ? "failing"
      : !connected
        ? "not_connected"
        : hasEvidence
          ? "connected"
          : "never_run";

    const healthDetail = failed
      ? `The last attempt failed${failure ? `: ${failure.headline}` : "."}`
      : !connected
        ? isRankProvider
          ? "No keywords are being tracked for this site yet."
          : "This source is not connected, so nothing is being collected."
        : hasEvidence
          ? "Connected and collecting."
          : "Connected, but nothing has been collected yet.";

    const schedule = describeSchedule(provider, history, integrations);

    return {
      key: provider.provider,
      spec,
      label: spec?.label ?? provider.label,
      what: spec?.what ?? "",
      health,
      healthLabel: HEALTH_LABEL[health],
      healthDetail,
      lastRunAt: provider.last_run_at,
      lastRunStatus: provider.last_run_status,
      lastSuccessAt: provider.last_success_at,
      rowCount: provider.row_count,
      rowUnit: spec?.rowUnit ?? "stored rows",
      scheduleLabel: schedule.label,
      scheduleDetail: schedule.detail,
      failure,
      failedRun: failed ? latest : null,
      fix: spec ? spec.fix(doorContext) : null,
      data: spec ? spec.data(doorContext) : null,
      runnable: spec?.runnable === true && connected,
      trackedTargets: isRankProvider ? trackedTargets : null,
    };
  });
}

/**
 * Schedule is EVIDENCE-derived: a real due date when the dispatcher gave one,
 * the site's own backlink cadence when it is set, and otherwise whether the
 * ledger has ever recorded a scheduled (rather than human-triggered) run.
 */
function describeSchedule(
  provider: ProviderScheduleStatus,
  history: ProviderRunHistory | null,
  integrations: SiteIntegrationsDraft,
): { label: string; detail: string } {
  if (provider.next_due_at) {
    return {
      label: `Due ${formatCompactDate(provider.next_due_at)}`,
      detail: "This source refreshes automatically on a schedule.",
    };
  }
  if (provider.provider === "dataforseo") {
    return integrations.dataForSeo.enabled
      ? {
          label:
            integrations.dataForSeo.cadence === "weekly"
              ? "Every week"
              : "Every month",
          detail: "Backlinks refresh automatically on this cadence.",
        }
      : {
          label: "Not scheduled",
          detail:
            "Backlinks only refresh when someone asks. Turn on automatic refresh to keep them current without thinking about it.",
        };
  }
  if (history?.lastScheduledAt) {
    return {
      label: "Automatic",
      detail: `This source refreshes on its own — the platform last started a refresh ${formatCompactDate(history.lastScheduledAt)}.`,
    };
  }
  return {
    label: "On demand",
    detail: "This source runs when you (or an agent) ask for it.",
  };
}

/**
 * ONE query for the site's collection status. The panel renders it and the
 * settings surface exposes it to agents — same cache entry, one request.
 */
export function useCollectionStatus(site: MarketingSite, sitePath: string) {
  const dispatch = useAppDispatch();
  return useQuery({
    queryKey: [...marketingKeys.site(site.id), "collection-status"] as const,
    queryFn: async ({ signal }) => {
      const [response, runHistory, trackedTargets] = await Promise.all([
        dispatch(
          callApi({
            path: SCHEDULE_STATUS_PATH,
            method: "GET",
            pathParams: { site_id: site.id },
            signal,
          }),
        ),
        getLatestCollectionRunsBySite(site.id, signal),
        countActiveRankTargets(site.id, signal),
      ]);
      if (response.error) throw new Error(response.error.message);
      const payload = response.data as unknown as SiteScheduleStatusResponse;
      return buildRows(
        payload.providers,
        runHistory,
        trackedTargets,
        site,
        sitePath,
      );
    },
    staleTime: 30_000,
  });
}

/** The agent-facing projection of one row — no icons, no React, no jargon. */
export function collectionStatusForSurface(rows: CollectionStatusRow[]) {
  return rows.map((row) => ({
    provider: row.key,
    label: row.label,
    collects: row.what,
    health: row.health,
    status: row.healthDetail,
    last_run_at: row.lastRunAt,
    last_success_at: row.lastSuccessAt,
    rows_collected: row.rowCount,
    rows_unit: row.rowUnit,
    refreshes: row.scheduleLabel,
    failure_cause: row.failure ? row.failure.headline : null,
    fix_url: row.fix?.href ?? null,
    data_url: row.data?.href ?? null,
  }));
}
