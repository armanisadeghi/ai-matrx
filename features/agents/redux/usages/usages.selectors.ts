/**
 * agentUsages selectors — every property memoized via createSelector, factory
 * selectors for arg-bound reads (per the Redux house rules).
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { DRIFT_SEVERITY_ORDER } from "@/features/agents/components/usages/severity";
import { usageCacheKey, rowMutationKey, type UsageScope } from "./usages.slice";
import type {
  AgentUsageAggregate,
  AgentUsageRow,
  DriftAlertRow,
  DriftSeverity,
} from "./usages.types";

const selectUsageCaches = (s: RootState) => s.agentUsages.usageCaches;
const selectReportState = (s: RootState) => s.agentUsages.report;
const selectAlertsState = (s: RootState) => s.agentUsages.alerts;
const selectRowMutations = (s: RootState) => s.agentUsages.rowMutations;

export const selectBulkState = (s: RootState) => s.agentUsages.bulk;

const EMPTY_ROWS: AgentUsageRow[] = [];
const EMPTY_AGGS: AgentUsageAggregate[] = [];
const EMPTY_ALERTS: DriftAlertRow[] = [];

export const makeSelectUsageCache = (scope: UsageScope, agentId: string) =>
  createSelector(
    selectUsageCaches,
    (caches) => caches[usageCacheKey(scope, agentId)] ?? null,
  );

export const makeSelectUsageRows = (scope: UsageScope, agentId: string) =>
  createSelector(
    makeSelectUsageCache(scope, agentId),
    (cache) => cache?.result?.rows ?? EMPTY_ROWS,
  );

export const makeSelectUsageAggregates = (scope: UsageScope, agentId: string) =>
  createSelector(
    makeSelectUsageCache(scope, agentId),
    (cache) => cache?.result?.aggregates ?? EMPTY_AGGS,
  );

/** Rows grouped by usage_type, ordered for display. */
export const makeSelectUsageGroups = (scope: UsageScope, agentId: string) =>
  createSelector(makeSelectUsageRows(scope, agentId), (rows) => {
    const groups = new Map<string, AgentUsageRow[]>();
    for (const r of rows) {
      const arr = groups.get(r.usageType) ?? [];
      arr.push(r);
      groups.set(r.usageType, arr);
    }
    return Array.from(groups.entries()).map(([usageType, items]) => ({
      usageType,
      items,
    }));
  });

export interface RedFlagSummary {
  bySeverity: Record<DriftSeverity, number>;
  stalePins: number;
  totalUsages: number;
  /** Rows that can be one-click updated (caller-managed, stale, remediable). */
  updatableKeys: Array<{ usageType: string; usageId: string }>;
  hasRedFlags: boolean;
}

const REMEDIABLE = new Set(["shortcut", "app", "prompt_app", "derived_agent"]);

export const makeSelectRedFlagSummary = (scope: UsageScope, agentId: string) =>
  createSelector(
    makeSelectUsageRows(scope, agentId),
    (rows): RedFlagSummary => {
      const bySeverity: Record<DriftSeverity, number> = {
        breaking: 0,
        silent_breaking: 0,
        warning: 0,
        info: 0,
      };
      let stalePins = 0;
      const updatableKeys: Array<{ usageType: string; usageId: string }> = [];
      for (const r of rows) {
        if (r.worstSeverity) bySeverity[r.worstSeverity] += 1;
        if (r.stalePin) stalePins += 1;
        if (r.managedByCaller && r.stalePin && REMEDIABLE.has(r.usageType)) {
          updatableKeys.push({ usageType: r.usageType, usageId: r.usageId });
        }
      }
      const hasRedFlags =
        bySeverity.breaking > 0 ||
        bySeverity.silent_breaking > 0 ||
        bySeverity.warning > 0;
      return {
        bySeverity,
        stalePins,
        totalUsages: rows.length,
        updatableKeys,
        hasRedFlags,
      };
    },
  );

/** Admin-scope rows filtered client-side by the filter bar. */
export interface AdminUsageFilters {
  ownerUserId?: string | null;
  organizationId?: string | null;
  severity?: DriftSeverity | null;
  usageType?: string | null;
}

export const makeSelectFilteredAdminRows = (
  agentId: string,
  filters: AdminUsageFilters,
) =>
  createSelector(makeSelectUsageRows("admin", agentId), (rows) =>
    rows.filter((r) => {
      if (filters.ownerUserId && r.ownerUserId !== filters.ownerUserId)
        return false;
      if (filters.organizationId && r.organizationId !== filters.organizationId)
        return false;
      if (filters.usageType && r.usageType !== filters.usageType) return false;
      if (filters.severity && r.worstSeverity !== filters.severity)
        return false;
      return true;
    }),
  );

export const makeSelectRowMutation = (usageType: string, usageId: string) =>
  createSelector(
    selectRowMutations,
    (m) => m[rowMutationKey(usageType, usageId)] ?? null,
  );

// ── Report ──────────────────────────────────────────────────────────────────

export const makeSelectReport = (scope: UsageScope) =>
  createSelector(selectReportState, (report) => report[scope]);

export type ReportSortKey =
  | "agentName"
  | "totalUsages"
  | "breaking"
  | "silent"
  | "warning"
  | "stalePins";

export const makeSelectReportSorted = (
  scope: UsageScope,
  sortKey: ReportSortKey,
  desc: boolean,
) =>
  createSelector(makeSelectReport(scope), (entry) => {
    if (scope === "admin") {
      const rows = [...entry.adminRows];
      rows.sort((a, b) => cmpAdmin(a, b, sortKey) * (desc ? -1 : 1));
      return { adminRows: rows, rows: [] as never[] };
    }
    const rows = [...entry.rows];
    rows.sort((a, b) => cmpUser(a, b, sortKey) * (desc ? -1 : 1));
    return { rows, adminRows: [] as never[] };
  });

function cmpUser(
  a: {
    agentName: string;
    myUsageCount: number;
    myBreaking: number;
    mySilent: number;
    myWarning: number;
    myStalePins: number;
  },
  b: typeof a,
  key: ReportSortKey,
): number {
  switch (key) {
    case "agentName":
      return a.agentName.localeCompare(b.agentName);
    case "totalUsages":
      return a.myUsageCount - b.myUsageCount;
    case "breaking":
      return a.myBreaking - b.myBreaking;
    case "silent":
      return a.mySilent - b.mySilent;
    case "warning":
      return a.myWarning - b.myWarning;
    case "stalePins":
      return a.myStalePins - b.myStalePins;
  }
}

function cmpAdmin(
  a: {
    agentName: string;
    usageCount: number;
    breaking: number;
    silent: number;
    warning: number;
    stalePins: number;
  },
  b: typeof a,
  key: ReportSortKey,
): number {
  switch (key) {
    case "agentName":
      return a.agentName.localeCompare(b.agentName);
    case "totalUsages":
      return a.usageCount - b.usageCount;
    case "breaking":
      return a.breaking - b.breaking;
    case "silent":
      return a.silent - b.silent;
    case "warning":
      return a.warning - b.warning;
    case "stalePins":
      return a.stalePins - b.stalePins;
  }
}

/** Report-wide severity totals (header chips). */
export const makeSelectReportTotals = (scope: UsageScope) =>
  createSelector(makeSelectReport(scope), (entry) => {
    const totals: Record<DriftSeverity, number> = {
      breaking: 0,
      silent_breaking: 0,
      warning: 0,
      info: 0,
    };
    let agents = 0;
    if (scope === "admin") {
      for (const r of entry.adminRows) {
        agents += 1;
        totals.breaking += r.breaking;
        totals.silent_breaking += r.silent;
        totals.warning += r.warning;
        totals.info += r.info;
      }
    } else {
      for (const r of entry.rows) {
        agents += 1;
        totals.breaking += r.myBreaking;
        totals.silent_breaking += r.mySilent;
        totals.warning += r.myWarning;
        totals.info += r.myInfo;
      }
    }
    return { totals, agents, order: DRIFT_SEVERITY_ORDER };
  });

// ── Alerts (banner) ──────────────────────────────────────────────────────────

export const selectDriftAlerts = createSelector(
  selectAlertsState,
  (a) => a.items ?? EMPTY_ALERTS,
);

export const selectDriftAlertsStatus = createSelector(
  selectAlertsState,
  (a) => a.status,
);

/** Active, undismissed alerts — what the agents-page header indicator reads. */
export const selectActiveBannerAlerts = createSelector(
  selectDriftAlerts,
  (items) =>
    items.filter(
      (a) =>
        (a.status === "pending" || a.status === "acknowledged") &&
        !a.dismissedAt,
    ),
);

export const selectUnseenAlertCount = createSelector(
  selectActiveBannerAlerts,
  (items) => items.filter((a) => !a.viewedAt).length,
);
