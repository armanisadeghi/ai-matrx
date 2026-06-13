/**
 * snake_case RPC rows → camelCase UI types for the agent-usages feature.
 * Mirrors the converter pattern in conversation-list / agent-shortcuts.
 */

import type {
  AgentDriftReportAdminRow,
  AgentDriftReportRow,
  AgentUsageAggregate,
  AgentUsageHistoryCount,
  AgentUsageRow,
  AgentUsageType,
  DriftAlertRow,
  DriftSeverity,
  UsageDriftFinding,
  UsagePinMode,
} from "./usages.types";

function asFindings(raw: unknown): UsageDriftFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => {
    const obj = (f ?? {}) as Record<string, unknown>;
    return {
      driftClass: String(obj.drift_class ?? ""),
      severity: (obj.severity ?? "info") as DriftSeverity,
      detail: (obj.detail ?? {}) as Record<string, unknown>,
    };
  });
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : [];
}

function asNumberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = Number(v) || 0;
  }
  return out;
}

/** Split a raw `agx_usage_scan` / `_admin` result into usage + aggregate rows. */
export function toUsagesResult(
  agentId: string,
  rows: ReadonlyArray<Record<string, unknown>>,
): { rows: AgentUsageRow[]; aggregates: AgentUsageAggregate[] } {
  const usages: AgentUsageRow[] = [];
  const aggregates: AgentUsageAggregate[] = [];

  for (const r of rows) {
    if (r.row_kind === "aggregate") {
      aggregates.push({
        rowKind: "aggregate",
        usageType: r.usage_type as AgentUsageType,
        organizationId: (r.organization_id as string) ?? null,
        organizationName: (r.organization_name as string) ?? null,
        orgManagerUserIds: asStringArray(r.org_manager_user_ids),
        agentId: r.agent_id as string,
        agentName: (r.agent_name as string) ?? "",
        currentVersion: Number(r.current_version) || 0,
        count: Number(r.agg_usage_count) || 0,
        breaking: Number(r.agg_breaking) || 0,
        silentBreaking: Number(r.agg_silent) || 0,
        warning: Number(r.agg_warning) || 0,
        info: Number(r.agg_info) || 0,
        stalePins: Number(r.agg_stale_pins) || 0,
        worstSeverity: (r.severity as DriftSeverity) ?? null,
      });
      continue;
    }
    usages.push({
      rowKind: "usage",
      usageType: r.usage_type as AgentUsageType,
      usageId: r.usage_id as string,
      nodeId: (r.node_id as string) ?? null,
      label: (r.label as string) ?? "",
      ownerUserId: (r.owner_user_id as string) ?? null,
      organizationId: (r.organization_id as string) ?? null,
      organizationName: (r.organization_name as string) ?? null,
      orgManagerUserIds: asStringArray(r.org_manager_user_ids),
      agentId: r.agent_id as string,
      agentName: (r.agent_name as string) ?? "",
      currentVersion: Number(r.current_version) || 0,
      pinMode: (r.pin_mode as UsagePinMode) ?? "follow_active",
      pinnedVersionId: (r.pinned_version_id as string) ?? null,
      pinnedVersionNumber:
        r.pinned_version_number == null
          ? null
          : Number(r.pinned_version_number),
      versionsBehind:
        r.versions_behind == null ? null : Number(r.versions_behind),
      stalePin: Boolean(r.stale_pin),
      isUsageActive:
        r.is_usage_active == null ? null : Boolean(r.is_usage_active),
      worstSeverity: (r.severity as DriftSeverity) ?? null,
      findings: asFindings(r.findings),
      config: (r.config as Record<string, unknown>) ?? null,
      managedByCaller: Boolean(r.managed_by_caller),
      usageUpdatedAt: (r.usage_updated_at as string) ?? null,
    });
  }
  return { rows: usages, aggregates };
}

export function toReportRow(r: Record<string, unknown>): AgentDriftReportRow {
  return {
    agentId: r.agent_id as string,
    agentName: (r.agent_name as string) ?? "",
    currentVersion: Number(r.current_version) || 0,
    agentIsActive: Boolean(r.agent_is_active),
    ownedByCaller: Boolean(r.owned_by_caller),
    myUsageCount: Number(r.my_usage_count) || 0,
    myBreaking: Number(r.my_breaking) || 0,
    mySilent: Number(r.my_silent) || 0,
    myWarning: Number(r.my_warning) || 0,
    myInfo: Number(r.my_info) || 0,
    myStalePins: Number(r.my_stale_pins) || 0,
    othersUsageCount:
      r.others_usage_count == null ? null : Number(r.others_usage_count),
    othersRedflagCount:
      r.others_redflag_count == null ? null : Number(r.others_redflag_count),
    byType: asNumberRecord(r.by_type),
    alertId: (r.alert_id as string) ?? null,
    alertStatus: (r.alert_status as string) ?? null,
    alertSeverity: (r.alert_severity as string) ?? null,
    alertDetectedAt: (r.alert_detected_at as string) ?? null,
    alertLastScannedAt: (r.alert_last_scanned_at as string) ?? null,
  };
}

export function toReportAdminRow(
  r: Record<string, unknown>,
): AgentDriftReportAdminRow {
  return {
    agentId: r.agent_id as string,
    agentName: (r.agent_name as string) ?? "",
    currentVersion: Number(r.current_version) || 0,
    agentIsActive: Boolean(r.agent_is_active),
    agentOwnerId: (r.agent_owner_id as string) ?? null,
    agentOwnerEmail: (r.agent_owner_email as string) ?? null,
    usageCount: Number(r.usage_count) || 0,
    breaking: Number(r.breaking) || 0,
    silent: Number(r.silent) || 0,
    warning: Number(r.warning) || 0,
    info: Number(r.info) || 0,
    stalePins: Number(r.stale_pins) || 0,
    affectedUsers: Number(r.affected_users) || 0,
    owners: Array.isArray(r.owners)
      ? (r.owners as Array<{ user_id: string }>)
      : [],
    byType: asNumberRecord(r.by_type),
    openAlerts: Number(r.open_alerts) || 0,
  };
}

export function toHistoryCount(
  r: Record<string, unknown>,
): AgentUsageHistoryCount {
  return {
    source: r.source as string,
    total: Number(r.total) || 0,
    lastUsedAt: (r.last_used_at as string) ?? null,
  };
}

/** Convert a raw `agx_drift_alert` table row (snake_case) to the UI shape. */
export function toDriftAlert(r: Record<string, unknown>): DriftAlertRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    agentId: r.agent_id as string,
    agentName: (r.agent_name as string) ?? "",
    severity: (r.severity as DriftAlertRow["severity"]) ?? "warning",
    usageCount: Number(r.usage_count) || 0,
    breakingCount: Number(r.breaking_count) || 0,
    silentCount: Number(r.silent_count) || 0,
    warningCount: Number(r.warning_count) || 0,
    infoCount: Number(r.info_count) || 0,
    status: (r.status as DriftAlertRow["status"]) ?? "pending",
    viewedAt: (r.viewed_at as string) ?? null,
    dismissedAt: (r.dismissed_at as string) ?? null,
    detectedAt: r.detected_at as string,
    lastScannedAt: r.last_scanned_at as string,
  };
}
