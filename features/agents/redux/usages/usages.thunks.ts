/**
 * agentUsages thunks — every find-usages / drift / remediation / alert RPC.
 *
 * Read thunks return data into the slice via the granular reducers (no large
 * object replacement). Remediation thunks patch the affected row optimistically
 * and invalidate the report caches. Alert dismissal is optimistic with rollback.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  toDriftAlert,
  toHistoryCount,
  toReportAdminRow,
  toReportRow,
  toUsagesResult,
} from "./usages.converters";
import {
  alertDismissed,
  alertDismissRolledBack,
  alertsFailed,
  alertsLoaded,
  alertsPending,
  alertViewed,
  applyUsageUpdated,
  bulkFinished,
  bulkStarted,
  clearRowMutation,
  invalidateReports,
  invalidateUsages,
  reportFailed,
  reportPending,
  reportSucceeded,
  setRowMutation,
  usagesFailed,
  usagesPending,
  usagesSucceeded,
  type UsageScope,
} from "./usages.slice";
import type {
  AgentUsageHistoryCount,
  BulkRemediationResult,
  UsageRemediationResult,
} from "./usages.types";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

type Row = Record<string, unknown>;

/** Fetch + cache one agent's usages (user or admin scope). */
export const fetchAgentUsages = createAsyncThunk<
  void,
  { agentId: string; scope: UsageScope; force?: boolean },
  ThunkApi
>("agentUsages/fetch", async ({ agentId, scope, force }, { dispatch, getState }) => {
  const cache = getState().agentUsages.usageCaches[`${scope}:${agentId}`];
  if (!force && cache && (cache.status === "loading" || cache.status === "succeeded")) {
    return;
  }
  dispatch(usagesPending({ scope, agentId }));
  try {
    const fn = scope === "admin" ? "agx_usage_scan_admin" : "agx_usage_scan";
    const { data, error } = await supabase.rpc(fn, { p_agent_id: agentId });
    if (error) throw pgErrorToError(error);
    const { rows, aggregates } = toUsagesResult(agentId, (data ?? []) as Row[]);
    dispatch(usagesSucceeded({ scope, agentId, result: { agentId, rows, aggregates } }));
  } catch (e) {
    dispatch(usagesFailed({ scope, agentId, error: e instanceof Error ? e.message : String(e) }));
  }
});

/** Historical (non-drift) usage counts — lazy, returned directly. */
export const fetchUsageHistoryCounts = createAsyncThunk<
  AgentUsageHistoryCount[],
  { agentId: string },
  ThunkApi
>("agentUsages/historyCounts", async ({ agentId }) => {
  const { data, error } = await supabase.rpc("agx_usage_history_counts", {
    p_agent_id: agentId,
  });
  if (error) throw pgErrorToError(error);
  return ((data ?? []) as Row[]).map(toHistoryCount);
});

/** Fetch + cache the drift report rollup (user or admin scope). */
export const fetchAgentUsageReport = createAsyncThunk<
  void,
  { scope: UsageScope; force?: boolean },
  ThunkApi
>("agentUsages/report", async ({ scope, force }, { dispatch, getState }) => {
  const entry = getState().agentUsages.report[scope];
  if (!force && (entry.status === "loading" || entry.status === "succeeded")) return;
  dispatch(reportPending({ scope }));
  try {
    if (scope === "admin") {
      const { data, error } = await supabase.rpc("agx_usage_report_admin");
      if (error) throw pgErrorToError(error);
      dispatch(reportSucceeded({ scope, adminRows: ((data ?? []) as Row[]).map(toReportAdminRow) }));
    } else {
      const { data, error } = await supabase.rpc("agx_usage_report");
      if (error) throw pgErrorToError(error);
      dispatch(reportSucceeded({ scope, rows: ((data ?? []) as Row[]).map(toReportRow) }));
    }
  } catch (e) {
    dispatch(reportFailed({ scope, error: e instanceof Error ? e.message : String(e) }));
  }
});

/** Update one usage to the active version. Optimistically patches the row. */
export const updateUsageToActive = createAsyncThunk<
  UsageRemediationResult,
  {
    agentId: string;
    scope: UsageScope;
    usageType: string;
    usageId: string;
    mode?: "repin_active" | "follow_active";
  },
  ThunkApi
>(
  "agentUsages/updateOne",
  async ({ agentId, scope, usageType, usageId, mode = "repin_active" }, { dispatch }) => {
    dispatch(setRowMutation({ usageType, usageId, status: "updating" }));
    try {
      const { data, error } = await supabase.rpc("agx_usage_update_to_active", {
        p_usage_type: usageType,
        p_usage_id: usageId,
        p_mode: mode,
      });
      if (error) throw pgErrorToError(error);
      const result = (data ?? {}) as unknown as UsageRemediationResult;
      if (result.success) {
        dispatch(
          applyUsageUpdated({
            scope,
            agentId,
            usageType,
            usageId,
            mode,
            pinnedVersionNumber: result.pinnedVersionNumber ?? null,
          }),
        );
        dispatch(invalidateReports());
        dispatch(clearRowMutation({ usageType, usageId }));
      } else {
        dispatch(setRowMutation({ usageType, usageId, status: "failed" }));
      }
      return result;
    } catch (e) {
      dispatch(setRowMutation({ usageType, usageId, status: "failed" }));
      throw e;
    }
  },
);

/** Update every stale, remediable usage of one agent the caller may manage. */
export const updateAllUsagesToActive = createAsyncThunk<
  BulkRemediationResult,
  { agentId: string; scope: UsageScope; mode?: "repin_active" | "follow_active" },
  ThunkApi
>("agentUsages/updateAll", async ({ agentId, scope, mode = "repin_active" }, { dispatch }) => {
  dispatch(bulkStarted({ scope, agentId }));
  try {
    const { data, error } = await supabase.rpc("agx_usage_update_all_to_active", {
      p_agent_id: agentId,
      p_mode: mode,
    });
    if (error) throw pgErrorToError(error);
    dispatch(bulkFinished({}));
    // Refetch the affected scope and invalidate reports so all surfaces refresh.
    dispatch(invalidateReports());
    dispatch(fetchAgentUsages({ agentId, scope, force: true }));
    return (data ?? { updated: 0, by_type: {}, skipped: [] }) as unknown as BulkRemediationResult;
  } catch (e) {
    dispatch(bulkFinished({ error: e instanceof Error ? e.message : String(e) }));
    throw e;
  }
});

/** Load the caller's open drift alerts (RLS-scoped to own rows) for the banner. */
export const fetchDriftAlerts = createAsyncThunk<void, { force?: boolean } | void, ThunkApi>(
  "agentUsages/fetchAlerts",
  async (arg, { dispatch, getState }) => {
    const force = !!(arg && (arg as { force?: boolean }).force);
    const alerts = getState().agentUsages.alerts;
    if (!force && (alerts.status === "loading" || alerts.status === "succeeded")) return;
    dispatch(alertsPending());
    try {
      const { data, error } = await supabase
        .schema("agent")
        .from("drift_alert")
        .select("*")
        .in("status", ["pending", "acknowledged"])
        .order("detected_at", { ascending: false });
      if (error) throw pgErrorToError(error);
      dispatch(alertsLoaded(((data ?? []) as Row[]).map(toDriftAlert)));
    } catch (e) {
      dispatch(alertsFailed(e instanceof Error ? e.message : String(e)));
    }
  },
);

/** Stamp `viewed_at` on first render of an unseen alert (fire-and-forget). */
export const markDriftAlertViewed = createAsyncThunk<void, string, ThunkApi>(
  "agentUsages/markAlertViewed",
  async (alertId, { dispatch }) => {
    dispatch(alertViewed(alertId));
    const { error } = await supabase
      .schema("agent")
      .from("drift_alert")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", alertId)
      .is("viewed_at", null);
    // Loud on failure — a recovery layer firing means a real bug got past.
    if (error) console.error("[agentUsages] markDriftAlertViewed failed:", error.message);
  },
);

/** Dismiss an alert — optimistic, with rollback + toast on failure. */
export const dismissDriftAlert = createAsyncThunk<
  void,
  { alertId: string; previousStatus: "pending" | "acknowledged" },
  ThunkApi
>("agentUsages/dismissAlert", async ({ alertId, previousStatus }, { dispatch }) => {
  dispatch(alertDismissed(alertId));
  const { error } = await supabase
    .schema("agent")
    .from("drift_alert")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", alertId);
  if (error) {
    dispatch(alertDismissRolledBack({ id: alertId, previousStatus }));
    throw pgErrorToError(error);
  }
});
