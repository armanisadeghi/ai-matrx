/**
 * agentUsages slice — find-usages results, drift report rollups, and drift
 * alerts for the banner. One domain (drift), four consumers (window, admin
 * window, report, banner). Caches are keyed by scope so user/admin results
 * never collide.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  AgentDriftReportAdminRow,
  AgentDriftReportRow,
  AgentUsagesResult,
  DriftAlertRow,
  UsagesLoadStatus,
} from "./usages.types";

export type UsageScope = "user" | "admin";

interface UsageCacheEntry {
  status: UsagesLoadStatus;
  error: string | null;
  fetchedAt: number | null;
  result: AgentUsagesResult | null;
}

interface ReportEntry {
  status: UsagesLoadStatus;
  error: string | null;
  fetchedAt: number | null;
  rows: AgentDriftReportRow[];
  adminRows: AgentDriftReportAdminRow[];
}

interface BulkState {
  agentId: string | null;
  scope: UsageScope | null;
  status: "idle" | "running" | "succeeded" | "failed";
  error: string | null;
}

interface AgentUsagesState {
  /** key: `${scope}:${agentId}` */
  usageCaches: Record<string, UsageCacheEntry>;
  /** key: `${usageType}:${usageId}` → mutation status for one row */
  rowMutations: Record<string, "updating" | "failed">;
  bulk: BulkState;
  report: Record<UsageScope, ReportEntry>;
  alerts: {
    status: UsagesLoadStatus;
    error: string | null;
    fetchedAt: number | null;
    items: DriftAlertRow[];
  };
}

const emptyReport = (): ReportEntry => ({
  status: "idle",
  error: null,
  fetchedAt: null,
  rows: [],
  adminRows: [],
});

const initialState: AgentUsagesState = {
  usageCaches: {},
  rowMutations: {},
  bulk: { agentId: null, scope: null, status: "idle", error: null },
  report: { user: emptyReport(), admin: emptyReport() },
  alerts: { status: "idle", error: null, fetchedAt: null, items: [] },
};

export const usageCacheKey = (scope: UsageScope, agentId: string): string =>
  `${scope}:${agentId}`;
export const rowMutationKey = (usageType: string, usageId: string): string =>
  `${usageType}:${usageId}`;

const slice = createSlice({
  name: "agentUsages",
  initialState,
  reducers: {
    usagesPending(state, action: PayloadAction<{ scope: UsageScope; agentId: string }>) {
      const key = usageCacheKey(action.payload.scope, action.payload.agentId);
      const entry = state.usageCaches[key] ?? {
        status: "idle",
        error: null,
        fetchedAt: null,
        result: null,
      };
      entry.status = "loading";
      entry.error = null;
      state.usageCaches[key] = entry;
    },
    usagesSucceeded(
      state,
      action: PayloadAction<{ scope: UsageScope; agentId: string; result: AgentUsagesResult }>,
    ) {
      const key = usageCacheKey(action.payload.scope, action.payload.agentId);
      state.usageCaches[key] = {
        status: "succeeded",
        error: null,
        fetchedAt: Date.now(),
        result: action.payload.result,
      };
    },
    usagesFailed(
      state,
      action: PayloadAction<{ scope: UsageScope; agentId: string; error: string }>,
    ) {
      const key = usageCacheKey(action.payload.scope, action.payload.agentId);
      const entry = state.usageCaches[key] ?? {
        status: "idle",
        error: null,
        fetchedAt: null,
        result: null,
      };
      entry.status = "failed";
      entry.error = action.payload.error;
      state.usageCaches[key] = entry;
    },
    invalidateUsages(state, action: PayloadAction<{ agentId: string }>) {
      // Drop both scopes for this agent so the next mount refetches.
      for (const scope of ["user", "admin"] as const) {
        const key = usageCacheKey(scope, action.payload.agentId);
        if (state.usageCaches[key]) state.usageCaches[key].status = "idle";
      }
    },

    setRowMutation(
      state,
      action: PayloadAction<{ usageType: string; usageId: string; status: "updating" | "failed" }>,
    ) {
      state.rowMutations[rowMutationKey(action.payload.usageType, action.payload.usageId)] =
        action.payload.status;
    },
    clearRowMutation(state, action: PayloadAction<{ usageType: string; usageId: string }>) {
      delete state.rowMutations[
        rowMutationKey(action.payload.usageType, action.payload.usageId)
      ];
    },

    /**
     * Patch a single usage row after a successful update-to-active: clear its
     * findings, mark it following-active / repinned-current so the strip and
     * badges update without a full refetch.
     */
    applyUsageUpdated(
      state,
      action: PayloadAction<{
        scope: UsageScope;
        agentId: string;
        usageType: string;
        usageId: string;
        mode: string;
        pinnedVersionNumber: number | null;
      }>,
    ) {
      const { scope, agentId, usageType, usageId, mode, pinnedVersionNumber } = action.payload;
      const entry = state.usageCaches[usageCacheKey(scope, agentId)];
      const row = entry?.result?.rows.find(
        (r) => r.usageType === usageType && r.usageId === usageId,
      );
      if (!row) return;
      row.findings = [];
      row.worstSeverity = null;
      row.stalePin = false;
      row.versionsBehind = 0;
      if (mode === "follow_active") {
        row.pinMode = "follow_active";
        row.pinnedVersionId = null;
        row.pinnedVersionNumber = null;
      } else if (pinnedVersionNumber != null) {
        row.pinMode = "pinned";
        row.pinnedVersionNumber = pinnedVersionNumber;
      }
    },

    bulkStarted(state, action: PayloadAction<{ scope: UsageScope; agentId: string }>) {
      state.bulk = {
        agentId: action.payload.agentId,
        scope: action.payload.scope,
        status: "running",
        error: null,
      };
    },
    bulkFinished(state, action: PayloadAction<{ error?: string }>) {
      state.bulk.status = action.payload.error ? "failed" : "succeeded";
      state.bulk.error = action.payload.error ?? null;
    },
    bulkReset(state) {
      state.bulk = { agentId: null, scope: null, status: "idle", error: null };
    },

    reportPending(state, action: PayloadAction<{ scope: UsageScope }>) {
      const r = state.report[action.payload.scope];
      r.status = "loading";
      r.error = null;
    },
    reportSucceeded(
      state,
      action: PayloadAction<{
        scope: UsageScope;
        rows?: AgentDriftReportRow[];
        adminRows?: AgentDriftReportAdminRow[];
      }>,
    ) {
      const r = state.report[action.payload.scope];
      r.status = "succeeded";
      r.error = null;
      r.fetchedAt = Date.now();
      if (action.payload.rows) r.rows = action.payload.rows;
      if (action.payload.adminRows) r.adminRows = action.payload.adminRows;
    },
    reportFailed(state, action: PayloadAction<{ scope: UsageScope; error: string }>) {
      const r = state.report[action.payload.scope];
      r.status = "failed";
      r.error = action.payload.error;
    },
    invalidateReports(state) {
      state.report.user.status = "idle";
      state.report.admin.status = "idle";
    },

    alertsPending(state) {
      state.alerts.status = "loading";
      state.alerts.error = null;
    },
    alertsLoaded(state, action: PayloadAction<DriftAlertRow[]>) {
      state.alerts.status = "succeeded";
      state.alerts.error = null;
      state.alerts.fetchedAt = Date.now();
      state.alerts.items = action.payload;
    },
    alertsFailed(state, action: PayloadAction<string>) {
      state.alerts.status = "failed";
      state.alerts.error = action.payload;
    },
    alertViewed(state, action: PayloadAction<string>) {
      const a = state.alerts.items.find((x) => x.id === action.payload);
      if (a && !a.viewedAt) a.viewedAt = new Date().toISOString();
    },
    alertDismissed(state, action: PayloadAction<string>) {
      // Optimistic: remove from the active banner set immediately.
      const a = state.alerts.items.find((x) => x.id === action.payload);
      if (a) {
        a.status = "dismissed";
        a.dismissedAt = new Date().toISOString();
      }
    },
    alertDismissRolledBack(
      state,
      action: PayloadAction<{ id: string; previousStatus: DriftAlertRow["status"] }>,
    ) {
      const a = state.alerts.items.find((x) => x.id === action.payload.id);
      if (a) {
        a.status = action.payload.previousStatus;
        a.dismissedAt = null;
      }
    },
  },
});

export const {
  usagesPending,
  usagesSucceeded,
  usagesFailed,
  invalidateUsages,
  setRowMutation,
  clearRowMutation,
  applyUsageUpdated,
  bulkStarted,
  bulkFinished,
  bulkReset,
  reportPending,
  reportSucceeded,
  reportFailed,
  invalidateReports,
  alertsPending,
  alertsLoaded,
  alertsFailed,
  alertViewed,
  alertDismissed,
  alertDismissRolledBack,
} = slice.actions;

export default slice.reducer;
export type { AgentUsagesState };
