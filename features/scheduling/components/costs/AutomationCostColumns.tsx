"use client";

/**
 * The ONE set of cost-and-behavior cells for an automation. Every seat that
 * lists automations (Costs tab, System jobs tab, org admin) renders these, so a
 * flag, a link or a number can never disagree between two screens.
 */
import { RunApprovalCell } from "@/features/admin/spend-approvals/RunApprovalCell";
import { approvalStatusSync } from "@/features/admin/spend-approvals/spendApprovals";
import Link from "next/link";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { adminCostColumns } from "@/components/cost/adminCostColumns";
import {
  AUTOMATION_FLAG_SET,
  AiIcon,
  SpendFlagStrip,
  spendFlagColumn,
  type SpendFlagHit,
} from "@/components/cost/SpendFlagStrip";
import { AGENT_ICON, INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { FirstPlusMore } from "@/components/official/first-plus-more/FirstPlusMore";
import {
  agentHref,
  automationAiState,
  automationFlags,
  mandateHref,
  orgMandateHref,
  type AutomationAgentRef,
  type AutomationCostRow,
  type AutomationSeat,
} from "@/features/scheduling/service/automationCosts";

/** The automation rules' flags as icon-strip hits (plus "no model linked" from the AI state). */
export function automationFlagHits(row: AutomationCostRow | undefined): SpendFlagHit[] {
  if (!row) return [];
  const hits: SpendFlagHit[] = automationFlags(row).map((f) => ({
    slot: f.id === "automated_spend" ? "automated" : f.id === "admin_account" ? "test_account" : f.id,
    severity: f.severity,
    detail: f.detail,
  }));
  if (automationAiState(row) === "spend_unattributed") {
    hits.push({ slot: "unattributed", severity: "warning", detail: "Cost is recorded on its runs, but no model call is linked" });
  }
  return hits;
}

/** The detail panel's flag line: the same strip the table row shows. */
export function AutomationFlagStrip({ row }: { row: AutomationCostRow | undefined }) {
  return <SpendFlagStrip set={AUTOMATION_FLAG_SET} hits={automationFlagHits(row)} />;
}

function mandateDoor(key: string, seat: AutomationSeat, orgSlug?: string) {
  if (seat === "org") {
    return (
      <EntityRef token="mandate" id={key} name={key} href={orgSlug ? orgMandateHref(orgSlug, key) : undefined} disablePeek />
    );
  }
  return (
    <Link href={mandateHref(key)} className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline" title={`Mandate ${key}`}>
      <INTELLIGENCE_ICON className="h-3 w-3 shrink-0" />
      <span className="truncate" title={key}>{key}</span>
    </Link>
  );
}

function agentDoor(a: AutomationAgentRef, seat: AutomationSeat) {
  // Org admins are not platform admins: the agent's own record (with peek) is the door they can open.
  if (seat === "org") return <EntityRef token="agent" id={a.id} name={a.name} />;
  return (
    <Link href={agentHref(a, seat)} className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline" title={`Agent ${a.name}`}>
      <AGENT_ICON className="h-3 w-3 shrink-0" />
      <span className="truncate" title={a.name}>{a.name}</span>
    </Link>
  );
}

export function MandateCell({ row, seat, orgSlug }: { row: AutomationCostRow | undefined; seat: AutomationSeat; orgSlug?: string }) {
  return (
    <FirstPlusMore items={row?.mandates ?? []} getKey={(m) => m} label="mandates" render={(m) => mandateDoor(m, seat, orgSlug)} />
  );
}

export function AgentCell({ row, seat }: { row: AutomationCostRow | undefined; seat: AutomationSeat }) {
  return <FirstPlusMore items={row?.agents ?? []} getKey={(a) => a.id} label="agents" render={(a) => agentDoor(a, seat)} />;
}

export function AgentMandateLinks({ row, seat, orgSlug }: { row: AutomationCostRow | undefined; seat: AutomationSeat; orgSlug?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      {(row?.mandates ?? []).map((m) => <div key={`m-${m}`} className="min-w-0 truncate">{mandateDoor(m, seat, orgSlug)}</div>)}
      {(row?.agents ?? []).map((a) => <div key={`a-${a.id}`} className="min-w-0 truncate">{agentDoor(a, seat)}</div>)}
      {!row?.mandates.length && !row?.agents.length && <span className="text-muted-foreground">—</span>}
    </div>
  );
}

function Num({ v }: { v: number | null | undefined }) {
  return <span className="tabular-nums text-xs">{v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>;
}

const text = (v: string | null | undefined) => (
  <span className={`block truncate text-xs ${v ? "" : "text-muted-foreground"}`} title={v ?? undefined}>
    {v ?? "—"}
  </span>
);

const hide = <T,>(cols: MatrxColumnDef<T>[]) => cols.map((c) => ({ ...c, hidden: true }));

/**
 * The cost/behavior columns for any table whose rows map to an automation.
 * `get` resolves a row to its rollup (undefined = this row has no measurement).
 */
export function automationCostColumns<T>(
  get: (row: T) => AutomationCostRow | undefined,
  seat: AutomationSeat,
  orgSlug?: string,
): MatrxColumnDef<T>[] {
  const n = (f: (r: AutomationCostRow) => number | null) => (row: T) => {
    const r = get(row);
    return r ? f(r) : null;
  };
  const money = (id: string, label: string, f: (r: AutomationCostRow) => number | null) =>
    adminCostColumns<T>({ id, label, value: (row) => { const r = get(row); return r ? f(r) : null; } });
  const cols: MatrxColumnDef<T>[] = [
    {
      id: "cost_mandate",
      header: "Mandate",
      accessorFn: (row) => get(row)?.mandates.join(", ") ?? "",
      filter: "text",
      width: 96,
      cell: (row) => <MandateCell row={get(row)} seat={seat} orgSlug={orgSlug} />,
    },
    {
      id: "cost_agent",
      header: "Agent",
      accessorFn: (row) => get(row)?.agents.map((a) => a.name).join(", ") ?? "",
      filter: "text",
      width: 96,
      cell: (row) => <AgentCell row={get(row)} seat={seat} />,
    },
    {
      id: "cost_ai",
      header: "AI",
      accessorFn: (row) => {
        const r = get(row);
        return r ? automationAiState(r) : "not_measured";
      },
      filter: "select",
      filterOptions: [
        { value: "ai", label: "AI" },
        { value: "spend_unattributed", label: "No model linked" },
        { value: "no_spend", label: "No AI" },
        { value: "no_runs", label: "No runs" },
      ],
      width: 44,
      compact: true,
      align: "center",
      cell: (row) => {
        const r = get(row);
        return <AiIcon state={r ? automationAiState(r) : "not_measured"} />;
      },
    },
    spendFlagColumn<T>(AUTOMATION_FLAG_SET, (row) => automationFlagHits(get(row)), "cost_flags"),
    {
      id: "cost_approval",
      header: "Approval status",
      accessorFn: (row) => {
        const r = get(row);
        return r
          ? approvalStatusSync(seat === "admin" ? null : r.organization_id, [[r.automation_kind, r.automation_id]])
          : "none";
      },
      filter: "select",
      filterOptions: [
        { value: "waiting", label: "Waiting" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
        { value: "none", label: "None" },
      ],
      width: 120,
      cell: (row) => {
        const r = get(row);
        if (!r) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <RunApprovalCell
            orgId={seat === "admin" ? null : r.organization_id}
            subjects={[[r.automation_kind, r.automation_id]]}
            maxRunCost={r.max_run_cost}
            thresholdOrgId={r.organization_id}
            seat={seat}
            orgSlug={orgSlug}
          />
        );
      },
    },
    ...money("cost_total", "Cost 30d", (r) => r.cost),
    ...hide(money("cost_7d", "Cost 7d", (r) => r.cost_7d)),
    ...money("cost_est_month", "Est./month", (r) => r.est_monthly_cost),
    {
      id: "cost_runs",
      header: "Runs 30d",
      accessorFn: (row) => get(row)?.runs ?? null,
      filter: "number",
      align: "right",
      compact: true,
      width: 90,
      cell: (row) => <Num v={get(row)?.runs} />,
    },
    ...hide(money("cost_last_run", "Last run cost", (r) => r.last_run_cost)),
    ...money("cost_avg_run", "Avg cost/run", (r) => r.avg_run_cost),
    ...money("cost_max_run", "Max cost/run", (r) => r.max_run_cost),
    {
      id: "cost_avg_turns",
      header: "Avg turns",
      accessorFn: (row) => get(row)?.avg_turns ?? null,
      filter: "number",
      align: "right",
      width: 90,
      cell: (row) => <Num v={get(row)?.avg_turns} />,
    },
    {
      id: "cost_max_turns",
      header: "Max turns",
      accessorFn: (row) => get(row)?.max_turns ?? null,
      filter: "number",
      align: "right",
      width: 90,
      cell: (row) => <Num v={get(row)?.max_turns} />,
    },
    {
      id: "cost_models",
      header: "Models",
      accessorFn: (row) => get(row)?.models.join(", ") ?? "",
      filter: "text",
      width: 200,
      cell: (row) => {
        const r = get(row);
        return (
          <FirstPlusMore
            items={r?.models ?? []}
            getKey={(m) => m}
            label="models"
            render={(m) => (
              <span className={r?.premium_models.includes(m) ? "font-semibold text-destructive" : ""} title={m}>
                {m}
              </span>
            )}
          />
        );
      },
    },
    {
      id: "cost_runs_as",
      header: "Runs as",
      accessorFn: (row) => get(row)?.owner_email ?? "",
      filter: "text",
      width: 200,
      cell: (row) => text(get(row)?.owner_email),
    },
    {
      id: "cost_for_org",
      header: "For org",
      accessorFn: (row) => get(row)?.organization_name ?? "",
      filter: "text",
      width: 180,
      cell: (row) => text(get(row)?.organization_name),
    },
  ];
  const at = new Map(cols.map((c) => [String(c.id), c]));
  return AUTOMATION_COLUMN_ORDER.flatMap((id) => (at.has(id) ? [at.get(id)!] : []));
}

/**
 * THE column order (owner, 2026-10-08): the money right after who does the work, so the
 * sort column is on screen at 1440 with the chat panel open; behavior after it.
 * The first AUTOMATION_LEAD_COLUMNS ids go right after a board's name column; a board's own
 * descriptive columns (cadence, kind, state) follow them.
 */
export const AUTOMATION_COLUMN_ORDER = [
  "cost_mandate",
  "cost_agent",
  "cost_total",
  "cost_total_points",
  "cost_runs",
  "cost_avg_run",
  "cost_avg_run_points",
  "cost_flags",
  "cost_approval",
  "cost_ai",
  "cost_est_month",
  "cost_est_month_points",
  "cost_max_run",
  "cost_max_run_points",
  "cost_avg_turns",
  "cost_max_turns",
  "cost_models",
  "cost_runs_as",
  "cost_for_org",
  "cost_7d",
  "cost_7d_points",
  "cost_last_run",
  "cost_last_run_points",
] as const;
export const AUTOMATION_LEAD_COLUMNS = 9;
