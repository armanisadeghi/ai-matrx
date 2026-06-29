/**
 * Agent Find Usages + Drift Detection — frontend types.
 *
 * The camelCase shapes the UI consumes, plus compile-time `DbRpcRow` guards
 * that pin each row interface to the live RPC return type (so a backend column
 * rename breaks the build, not production). Converters in `usages.converters.ts`
 * map the snake_case RPC rows to these shapes.
 *
 * Backend contract: migrations/agx_usage_002_scan_rpcs.sql +
 * agx_usage_003_remediation_and_drop_legacy.sql.
 */

import type { DbRpcRow } from "@/types/supabase-rpc";

/**
 * Drift severity, worst → least:
 *   breaking        — a variable the usage stores no longer exists, or a
 *                     required variable is unmet on a non-interactive usage, or
 *                     the agent was archived/disabled. The usage will fail.
 *   silent_breaking — a stored context slot no longer matches a declared slot:
 *                     the value still gets injected, but as plain default
 *                     context, so the slot's rules (always/never inline) are
 *                     silently ignored. Works, but wrong — and undetectable
 *                     without this check.
 *   warning         — pinned to a version older than the active one (stale pin).
 *   info            — pinned older but the structural contract is unchanged
 *                     (only instructions/model/settings moved).
 */
export type DriftSeverity = "breaking" | "silent_breaking" | "warning" | "info";

/** Whether a usage tracks the active version or is pinned to a snapshot. */
export type UsagePinMode = "pinned" | "follow_active";

/** Every forward-looking surface an agent can be used from. */
export type AgentUsageType =
  | "shortcut"
  | "app"
  | "scheduled_task"
  | "surface_binding"
  | "sms_line"
  | "workflow_node"
  | "derived_agent"
  | "comparison"
  | "code";

/** One drift finding within a usage row. */
export interface UsageDriftFinding {
  driftClass: string;
  severity: DriftSeverity;
  /** Class-specific detail, e.g. `{ keys: ["topic"] }` for missing_variable. */
  detail: Record<string, unknown>;
}

/** A `row_kind="usage"` row — one concrete usage with full detail. */
export interface AgentUsageRow {
  rowKind: "usage";
  usageType: AgentUsageType;
  usageId: string;
  /** Workflow node id within a workflow definition (workflow_node only). */
  nodeId: string | null;
  label: string;
  ownerUserId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  /** Org owners/admins to notify when the caller can't remediate org usage. */
  orgManagerUserIds: string[];
  agentId: string;
  agentName: string;
  currentVersion: number;
  pinMode: UsagePinMode;
  pinnedVersionId: string | null;
  pinnedVersionNumber: number | null;
  versionsBehind: number | null;
  stalePin: boolean;
  isUsageActive: boolean | null;
  worstSeverity: DriftSeverity | null;
  findings: UsageDriftFinding[];
  /** Stored config bundle for the detail pane (+ resolved `effective` contract). */
  config: Record<string, unknown> | null;
  /** Caller owns this usage or is owner/admin of its org → can update in place. */
  managedByCaller: boolean;
  usageUpdatedAt: string | null;
}

/**
 * A `row_kind="aggregate"` row — counts only, for usages the caller neither
 * owns nor org-manages. No ids/labels leak (a "don't decide for others" wall).
 */
export interface AgentUsageAggregate {
  rowKind: "aggregate";
  usageType: AgentUsageType;
  organizationId: string | null;
  organizationName: string | null;
  orgManagerUserIds: string[];
  agentId: string;
  agentName: string;
  currentVersion: number;
  count: number;
  breaking: number;
  silentBreaking: number;
  warning: number;
  info: number;
  stalePins: number;
  /** Worst severity across the aggregated rows (for the badge). */
  worstSeverity: DriftSeverity | null;
}

/** The full result of one find-usages scan. */
export interface AgentUsagesResult {
  agentId: string;
  rows: AgentUsageRow[];
  aggregates: AgentUsageAggregate[];
}

/** One rollup row in the user drift report (`agx_usage_report`). */
export interface AgentDriftReportRow {
  agentId: string;
  agentName: string;
  currentVersion: number;
  agentIsActive: boolean;
  ownedByCaller: boolean;
  myUsageCount: number;
  myBreaking: number;
  mySilent: number;
  myWarning: number;
  myInfo: number;
  myStalePins: number;
  othersUsageCount: number | null;
  othersRedflagCount: number | null;
  byType: Record<string, number>;
  alertId: string | null;
  alertStatus: string | null;
  alertSeverity: string | null;
  alertDetectedAt: string | null;
  alertLastScannedAt: string | null;
}

/** One rollup row in the admin drift report (`agx_usage_report_admin`). */
export interface AgentDriftReportAdminRow {
  agentId: string;
  agentName: string;
  currentVersion: number;
  agentIsActive: boolean;
  agentOwnerId: string | null;
  agentOwnerEmail: string | null;
  usageCount: number;
  breaking: number;
  silent: number;
  warning: number;
  info: number;
  stalePins: number;
  affectedUsers: number;
  owners: Array<{ user_id: string }>;
  byType: Record<string, number>;
  openAlerts: number;
}

/** One row of historical (non-drift) usage context. */
export interface AgentUsageHistoryCount {
  source: string;
  total: number;
  lastUsedAt: string | null;
}

/** A drift alert row (banner + future unified inbox). */
export interface DriftAlertRow {
  id: string;
  userId: string;
  agentId: string;
  agentName: string;
  severity: "breaking" | "silent_breaking" | "warning";
  usageCount: number;
  breakingCount: number;
  silentCount: number;
  warningCount: number;
  infoCount: number;
  status: "pending" | "acknowledged" | "dismissed" | "resolved" | "expired";
  viewedAt: string | null;
  dismissedAt: string | null;
  detectedAt: string;
  lastScannedAt: string;
}

/** Result of a single / bulk remediation. */
export interface UsageRemediationResult {
  success: boolean;
  usageType?: string;
  usageId?: string;
  mode?: string;
  pinnedVersionNumber?: number | null;
  error?: string;
  message?: string;
  workflowId?: string;
  codePath?: string;
}

export interface BulkRemediationResult {
  updated: number;
  byType: Record<string, number>;
  skipped: Array<{ usage_type: string; usage_id: string; reason: string }>;
}

export type UsagesLoadStatus = "idle" | "loading" | "succeeded" | "failed";

// ---------------------------------------------------------------------------
// Compile-time guards — pin each interface to the live RPC row shape.
// (snake_case RPC columns vs camelCase UI types: we guard the raw shapes the
//  converters consume, declared inline so a column rename fails the build.)
// ---------------------------------------------------------------------------

/** Raw `agx_usage_scan` row — the converter input. */
export type RawUsageScanRow = DbRpcRow<"agx_usage_scan">;
/** Raw `agx_usage_scan_admin` row. */
export type RawUsageScanAdminRow = DbRpcRow<"agx_usage_scan_admin">;
/** Raw `agx_usage_report` row. */
export type RawUsageReportRow = DbRpcRow<"agx_usage_report">;
/** Raw `agx_usage_report_admin` row. */
export type RawUsageReportAdminRow = DbRpcRow<"agx_usage_report_admin">;
/** Raw `agx_usage_history_counts` row. */
export type RawUsageHistoryRow = DbRpcRow<"agx_usage_history_counts">;
