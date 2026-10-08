"use client";

/**
 * The ONE set of cost-and-behavior cells for an automation. Every seat that
 * lists automations (Costs tab, System jobs tab, org admin) renders these, so a
 * flag, a link or a number can never disagree between two screens.
 */
import { RunApprovalCell } from "@/features/admin/spend-approvals/RunApprovalCell";
import { approvalStatusSync } from "@/features/admin/spend-approvals/spendApprovals";
import Link from "next/link";
import { Bot, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  agentHref,
  automationAiState,
  automationFlags,
  mandateHref,
  orgMandateHref,
  type AutomationCostRow,
  type AutomationSeat,
} from "@/features/scheduling/service/automationCosts";

export function AiStateBadge({ row }: { row: AutomationCostRow | undefined }) {
  if (!row) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Not measured
      </Badge>
    );
  }
  const state = automationAiState(row);
  if (state === "ai") {
    return (
      <Badge className="gap-1 bg-violet-600 text-[10px] text-white hover:bg-violet-600">
        <Bot className="h-3 w-3" /> AI
      </Badge>
    );
  }
  if (state === "spend_unattributed") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="max-w-full border-amber-500 text-[10px] text-amber-700 dark:text-amber-400">
            <span className="truncate">No model linked</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Cost is recorded on its runs, but no model call is linked to them</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      {state === "no_runs" ? "No runs" : "No AI"}
    </Badge>
  );
}

export function AutomationFlagBadges({ row }: { row: AutomationCostRow | undefined }) {
  if (!row) return null;
  const flags = automationFlags(row);
  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <Tooltip key={f.id}>
          <TooltipTrigger asChild>
            <Badge
              className={
                f.severity === "critical"
                  ? "bg-red-600 text-[10px] text-white hover:bg-red-600"
                  : "bg-amber-500 text-[10px] text-white hover:bg-amber-500"
              }
            >
              {f.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{f.detail}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function AgentMandateLinks({
  row,
  seat,
  orgSlug,
}: {
  row: AutomationCostRow | undefined;
  seat: AutomationSeat;
  /** Org seat: mandates open on the organization's own mandate page. */
  orgSlug?: string;
}) {
  if (!row || (row.agents.length === 0 && row.mandates.length === 0)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (seat === "org") {
    // Org admins are not platform admins: every door here is one they can open —
    // the organization's mandate page, and the agent's own record (with peek).
    return (
      <div className="flex min-w-0 flex-col gap-0.5 text-xs">
        {row.mandates.map((m) => (
          <EntityRef
            key={`m-${m}`}
            token="mandate"
            id={m}
            name={m}
            href={orgSlug ? orgMandateHref(orgSlug, m) : undefined}
            disablePeek
          />
        ))}
        {row.agents.map((a) => (
          <EntityRef key={`a-${a.id}`} token="agent" id={a.id} name={a.name} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      {row.mandates.map((m) => (
        <Link
          key={`m-${m}`}
          href={mandateHref(m)}
          className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
          title={`Mandate ${m}`}
        >
          <ScrollText className="h-3 w-3 shrink-0" />
          <span className="truncate">{m}</span>
        </Link>
      ))}
      {row.agents.map((a) => (
        <Link
          key={`a-${a.id}`}
          href={agentHref(a, seat)}
          className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
          title={`Agent ${a.name}`}
        >
          <Bot className="h-3 w-3 shrink-0" />
          <span className="truncate">{a.name}</span>
        </Link>
      ))}
    </div>
  );
}

export function RunsAsCell({ row }: { row: AutomationCostRow | undefined }) {
  if (!row) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="min-w-0 text-xs">
      <div className="truncate" title={row.owner_email ?? undefined}>
        {row.owner_email ?? "Unknown account"}
      </div>
      <div className="truncate text-muted-foreground" title={row.organization_name ?? undefined}>
        {row.organization_name ?? "No organization"}
        {row.organization_is_system ? " (system)" : ""}
      </div>
    </div>
  );
}

function Money({ usd }: { usd: number | null | undefined }) {
  const { format } = useCostDisplay();
  return <span className="tabular-nums text-xs">{usd == null ? "—" : format(usd)}</span>;
}

function Num({ v, dim }: { v: number | null | undefined; dim?: boolean }) {
  return (
    <span className={`tabular-nums text-xs ${dim ? "text-muted-foreground" : ""}`}>
      {v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
    </span>
  );
}

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
  return [
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
      width: 110,
      cell: (row) => <AiStateBadge row={get(row)} />,
    },
    {
      id: "cost_flags",
      header: "Flags",
      accessorFn: (row) => {
        const r = get(row);
        return r ? automationFlags(r).map((f) => f.label).join(", ") : "";
      },
      sortValue: (row) => {
        const r = get(row);
        return r ? automationFlags(r).length : 0;
      },
      filter: "text",
      width: 260,
      cell: (row) => <AutomationFlagBadges row={get(row)} />,
    },
    {
      id: "cost_approval",
      header: "Approval",
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
      width: 100,
      cell: (row) => {
        const r = get(row);
        if (!r) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <RunApprovalCell
            orgId={seat === "admin" ? null : r.organization_id}
            subjects={[[r.automation_kind, r.automation_id]]}
            maxRunCost={r.max_run_cost}
            seat={seat}
            orgSlug={orgSlug}
          />
        );
      },
    },
    {
      id: "cost_total",
      header: "Cost 30d",
      accessorFn: n((r) => r.cost),
      filter: "number",
      defaultSortDirection: "desc",
      width: 150,
      cell: (row) => <Money usd={get(row)?.cost} />,
    },
    {
      id: "cost_7d",
      header: "Cost 7d",
      accessorFn: n((r) => r.cost_7d),
      filter: "number",
      width: 150,
      cell: (row) => <Money usd={get(row)?.cost_7d} />,
    },
    {
      id: "cost_est_month",
      header: "Est. / month",
      accessorFn: n((r) => r.est_monthly_cost),
      filter: "number",
      width: 150,
      cell: (row) => <Money usd={get(row)?.est_monthly_cost} />,
    },
    {
      id: "cost_runs",
      header: "Runs 30d",
      accessorFn: n((r) => r.runs),
      filter: "number",
      width: 90,
      cell: (row) => <Num v={get(row)?.runs} />,
    },
    {
      id: "cost_last_run",
      header: "Last run",
      accessorFn: n((r) => r.last_run_cost),
      filter: "number",
      width: 150,
      cell: (row) => <Money usd={get(row)?.last_run_cost} />,
    },
    {
      id: "cost_avg_run",
      header: "Avg / run",
      accessorFn: n((r) => r.avg_run_cost),
      filter: "number",
      width: 150,
      cell: (row) => <Money usd={get(row)?.avg_run_cost} />,
    },
    {
      id: "cost_max_run",
      header: "Max / run",
      accessorFn: n((r) => r.max_run_cost),
      filter: "number",
      width: 150,
      cell: (row) => <Money usd={get(row)?.max_run_cost} />,
    },
    {
      id: "cost_avg_turns",
      header: "Avg turns",
      accessorFn: n((r) => r.avg_turns),
      filter: "number",
      width: 90,
      cell: (row) => <Num v={get(row)?.avg_turns} />,
    },
    {
      id: "cost_max_turns",
      header: "Max turns",
      accessorFn: n((r) => r.max_turns),
      filter: "number",
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
        if (!r || r.models.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {r.models.map((m) => (
              <Badge
                key={m}
                variant="outline"
                className={`text-[10px] ${r.premium_models.includes(m) ? "border-red-500 text-red-700 dark:text-red-400" : ""}`}
              >
                {m}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: "cost_invokes",
      header: "Mandates & agents",
      accessorFn: (row) => {
        const r = get(row);
        return r ? [...r.mandates, ...r.agents.map((a) => a.name)].join(", ") : "";
      },
      filter: "text",
      width: 240,
      cell: (row) => <AgentMandateLinks row={get(row)} seat={seat} orgSlug={orgSlug} />,
    },
    {
      id: "cost_runs_as",
      header: "Runs as / for",
      accessorFn: (row) => {
        const r = get(row);
        return r ? `${r.owner_email ?? ""} ${r.organization_name ?? ""}` : "";
      },
      filter: "text",
      width: 220,
      cell: (row) => <RunsAsCell row={get(row)} />,
    },
  ];
}
