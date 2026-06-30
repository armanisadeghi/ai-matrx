/**
 * Sortable per-agent rollup table for the Agent Drift report. Drives the
 * master pane of the master-detail layout; clicking a row selects that agent
 * for the detail engine. Works in both user and admin scope (admin adds an
 * "Affected users" column).
 */

"use client";

import { DriftSeverityBadge } from "@/features/agents/components/usages/DriftSeverityBadge";
import { DRIFT_SEVERITY_ORDER } from "@/features/agents/components/usages/severity";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  AgentDriftReportAdminRow,
  AgentDriftReportRow,
} from "@/features/agents/redux/usages/usages.types";
import type { ReportSortKey } from "@/features/agents/redux/usages/usages.selectors";

interface RollupSummary {
  agents: number;
  totals: Record<(typeof DRIFT_SEVERITY_ORDER)[number], number>;
}

interface RollupTableProps {
  mode: "user" | "admin";
  rows: AgentDriftReportRow[];
  adminRows: AgentDriftReportAdminRow[];
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
  sort: { key: ReportSortKey; desc: boolean };
  onSort: (key: ReportSortKey) => void;
  summary?: RollupSummary;
}

function Th({
  label,
  sortKey,
  active,
  desc,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey?: ReportSortKey;
  active?: boolean;
  desc?: boolean;
  onSort?: (k: ReportSortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
        sortKey && "cursor-pointer select-none hover:text-foreground",
      )}
      onClick={sortKey && onSort ? () => onSort(sortKey) : undefined}
    >
      <span
        className={cn(
          "inline-flex items-center gap-0.5",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        {active &&
          (desc ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          ))}
      </span>
    </th>
  );
}

export function RollupTable({
  mode,
  rows,
  adminRows,
  selectedAgentId,
  onSelect,
  sort,
  onSort,
  summary,
}: RollupTableProps) {
  const isAdmin = mode === "admin";
  const count = isAdmin ? adminRows.length : rows.length;

  if (count === 0) {
    return (
      <div className="px-3 py-12 text-center text-sm text-muted-foreground">
        {summary ? (
          <RollupSummaryLine
            mode={mode}
            summary={summary}
            className="mb-6 justify-center"
          />
        ) : null}
        No drift detected. Every agent&apos;s usages are healthy.
      </div>
    );
  }

  return (
    <>
      {summary ? (
        <RollupSummaryLine
          mode={mode}
          summary={summary}
          className="px-3 py-1.5"
        />
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-card">
          <tr>
            <Th
              label="Agent"
              sortKey="agentName"
              active={sort.key === "agentName"}
              desc={sort.desc}
              onSort={onSort}
            />
            <Th
              label="Usages"
              sortKey="totalUsages"
              active={sort.key === "totalUsages"}
              desc={sort.desc}
              onSort={onSort}
              align="right"
            />
            <Th
              label="Breaking"
              sortKey="breaking"
              active={sort.key === "breaking"}
              desc={sort.desc}
              onSort={onSort}
              align="right"
            />
            <Th
              label="Silent"
              sortKey="silent"
              active={sort.key === "silent"}
              desc={sort.desc}
              onSort={onSort}
              align="right"
            />
            <Th
              label="Stale"
              sortKey="stalePins"
              active={sort.key === "stalePins"}
              desc={sort.desc}
              onSort={onSort}
              align="right"
            />
            {isAdmin && <Th label="Users" align="right" />}
          </tr>
        </thead>
        <tbody>
          {isAdmin
            ? adminRows.map((r) => (
                <Row
                  key={r.agentId}
                  agentId={r.agentId}
                  name={r.agentName}
                  version={r.currentVersion}
                  usages={r.usageCount}
                  breaking={r.breaking}
                  silent={r.silent}
                  stale={r.stalePins}
                  extra={r.affectedUsers}
                  selected={selectedAgentId === r.agentId}
                  onSelect={onSelect}
                />
              ))
            : rows.map((r) => (
                <Row
                  key={r.agentId}
                  agentId={r.agentId}
                  name={r.agentName}
                  version={r.currentVersion}
                  usages={r.myUsageCount}
                  breaking={r.myBreaking}
                  silent={r.mySilent}
                  stale={r.myStalePins}
                  selected={selectedAgentId === r.agentId}
                  onSelect={onSelect}
                />
              ))}
        </tbody>
      </table>
    </>
  );
}

function RollupSummaryLine({
  mode,
  summary,
  className,
}: {
  mode: "user" | "admin";
  summary: RollupSummary;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>
        {summary.agents} agent{summary.agents !== 1 ? "s" : ""} with drift
        {mode === "admin" ? " (platform-wide)" : ""}
      </span>
      <div className="flex items-center gap-1.5">
        {DRIFT_SEVERITY_ORDER.map((sev) =>
          summary.totals[sev] > 0 ? (
            <DriftSeverityBadge
              key={sev}
              severity={sev}
              count={summary.totals[sev]}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function Row({
  agentId,
  name,
  version,
  usages,
  breaking,
  silent,
  stale,
  extra,
  selected,
  onSelect,
}: {
  agentId: string;
  name: string;
  version: number;
  usages: number;
  breaking: number;
  silent: number;
  stale: number;
  extra?: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelect(agentId)}
      className={cn(
        "cursor-pointer border-b border-border/50 transition-colors",
        selected ? "bg-accent" : "hover:bg-muted/40",
      )}
    >
      <td className="px-3 py-2">
        <div className="font-medium text-foreground">{name}</div>
        <div className="text-[11px] text-muted-foreground">
          v{version} active
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {usages}
      </td>
      <td className="px-3 py-2 text-right">
        {breaking > 0 ? (
          <DriftSeverityBadge
            severity="breaking"
            size="sm"
            count={breaking}
            iconOnly
          />
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {silent > 0 ? (
          <DriftSeverityBadge
            severity="silent_breaking"
            size="sm"
            count={silent}
            iconOnly
          />
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {stale || "—"}
      </td>
      {extra != null && (
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
          {extra}
        </td>
      )}
    </tr>
  );
}
