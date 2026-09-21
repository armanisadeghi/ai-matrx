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
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import type {
  AgentDriftReportAdminRow,
  AgentDriftReportRow,
} from "@/features/agents/redux/usages/usages.types";
import type { ReportSortKey } from "@/features/agents/redux/usages/usages.selectors";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

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

type CanonicalRollupRow = { agentId: string; agentName: string; currentVersion: number; usages: number; breaking: number; silent: number; stale: number; affectedUsers?: number };

export function RollupTable({
  mode,
  rows,
  adminRows,
  selectedAgentId,
  onSelect,
  sort: _sort,
  onSort: _onSort,
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

  const canonicalRows: CanonicalRollupRow[] = isAdmin
    ? adminRows.map((r) => ({ agentId: r.agentId, agentName: r.agentName, currentVersion: r.currentVersion, usages: r.usageCount, breaking: r.breaking, silent: r.silent, stale: r.stalePins, affectedUsers: r.affectedUsers }))
    : rows.map((r) => ({ agentId: r.agentId, agentName: r.agentName, currentVersion: r.currentVersion, usages: r.myUsageCount, breaking: r.myBreaking, silent: r.mySilent, stale: r.myStalePins }));
  const columns: MatrxColumnDef<CanonicalRollupRow>[] = [
    { id: 'agent', header: 'Agent', accessorFn: (row) => `${row.agentName} ${row.agentId}`, width: 260, cell: (row) => <div><div className="font-medium">{row.agentName}</div><div className="text-[11px] text-muted-foreground">v{row.currentVersion} active</div></div> },
    { id: 'usages', header: 'Usages', accessorKey: 'usages', filter: 'number', width: 100, cell: (row) => <span className="tabular-nums">{row.usages}</span> },
    { id: 'breaking', header: 'Breaking', accessorKey: 'breaking', filter: 'number', width: 100, cell: (row) => row.breaking ? <DriftSeverityBadge severity="breaking" size="sm" count={row.breaking} iconOnly /> : <span className="text-muted-foreground/40">—</span> },
    { id: 'silent', header: 'Silent', accessorKey: 'silent', filter: 'number', width: 90, cell: (row) => row.silent ? <DriftSeverityBadge severity="silent_breaking" size="sm" count={row.silent} iconOnly /> : <span className="text-muted-foreground/40">—</span> },
    { id: 'stale', header: 'Stale', accessorKey: 'stale', filter: 'number', width: 80, cell: (row) => <span className="tabular-nums">{row.stale || '—'}</span> },
    ...(isAdmin ? [{ id: 'users', header: 'Users', accessorKey: 'affectedUsers' as const, filter: 'number' as const, width: 80, cell: (row: CanonicalRollupRow) => <span className="tabular-nums">{row.affectedUsers ?? '—'}</span> }] : []),
  ];
  return (
    <>
      {summary ? (
        <RollupSummaryLine
          mode={mode}
          summary={summary}
          className="px-3 py-1.5"
        />
      ) : null}
      <MatrxDataTable urlState={{ id: `agent-drift-${mode}` }} data={canonicalRows} columns={columns} getRowId={(row) => row.agentId} pageSize={50} onRowOpen={(row) => onSelect(row.agentId)} rowClassName={(row) => row.agentId === selectedAgentId ? 'bg-accent' : undefined} toolbar={{ search: true, searchPlaceholder: 'Search agents…' }} detail={{ enabled: false }} />
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
