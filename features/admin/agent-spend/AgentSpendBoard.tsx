"use client";

/**
 * AI spend health — every agent and mandate with spend in the window, most expensive
 * first, with the owner's spend-rule red flags. seat="admin": every organization
 * (admin lane). seat="org": one organization (its admins), costs in points.
 * A row's name opens its detail page with every run.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge, Button, SegmentedControl } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Cost } from "@/components/cost/Cost";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { usageViewHref } from "@/features/admin/usage-drill/usageLinks";
import { orgAdminMemberHref } from "@/features/organizations/admin/routes";
import {
  TEST_ACCOUNT_EMAILS,
  agentSpendDetailHref,
  agentSpendFlags,
  fetchAgentSpend,
  spendAgentHref,
  spendMandateHref,
  type AgentSpendRow,
  type SpendFlag,
  type SpendSeat,
  type SpendWindowDays,
} from "./agentSpend";

export function useAgentSpend(orgId: string | null, days: SpendWindowDays) {
  const [rows, setRows] = useState<AgentSpendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchAgentSpend(orgId, days)
      .then((r) => live && setRows(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [orgId, days, tick]);
  return { rows, loading, error, reload: () => setTick((t) => t + 1) };
}

export const rowKey = (r: Pick<AgentSpendRow, "agent_id" | "mandate_key">) =>
  `${r.agent_id ?? "-"}:${r.mandate_key ?? "-"}`;

export function SpendFlagBadges({ flags }: { flags: SpendFlag[] }) {
  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1">
      {flags.map((f) => (
        <Tooltip key={f.id}>
          <TooltipTrigger asChild>
            <Badge tone={f.severity === "critical" ? "destructive" : "warning"} className="max-w-full truncate">
              {f.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{f.detail}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** Agent + mandate names, each opening its own page for this seat. */
export function SpendSubject({
  row,
  seat,
  orgSlug,
  days,
}: {
  row: AgentSpendRow;
  seat: SpendSeat;
  orgSlug?: string;
  days: SpendWindowDays;
}) {
  const title = row.agent_name ?? row.mandate_label ?? row.mandate_key ?? "Unknown agent";
  const agentHref = seat === "admin" ? spendAgentHref(row) : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Link
        href={agentSpendDetailHref(row, days, seat, orgSlug)}
        className="truncate font-medium text-primary hover:underline"
        title={`${title}: every run`}
      >
        {title}
      </Link>
      <div className="flex min-w-0 flex-col gap-0.5 text-xs">
        {row.agent_id && (
          <EntityRef token="agent" id={row.agent_id} name={row.agent_name ?? "Agent"} href={agentHref ?? undefined} />
        )}
        {row.mandate_key && (
          <EntityRef
            token="mandate"
            id={row.mandate_key}
            name={row.mandate_label ?? row.mandate_key}
            href={spendMandateHref(row.mandate_key, seat, orgSlug)}
            disablePeek
          />
        )}
      </div>
    </div>
  );
}

export function ModelList({ models, premium }: { models: string[]; premium: string[] }) {
  if (models.length === 0) return <span className="text-xs text-muted-foreground">Not recorded</span>;
  return (
    <div className="flex min-w-0 flex-col text-xs">
      {models.map((m) => (
        <span key={m} className={`truncate ${premium.includes(m) ? "font-semibold text-red-600" : ""}`} title={m}>
          {m}
        </span>
      ))}
    </div>
  );
}

/** Who paid: the people and organizations the spend landed on, biggest first. */
export function PaidBy({ row, seat, orgSlug }: { row: AgentSpendRow; seat: SpendSeat; orgSlug?: string }) {
  const top = row.payers.slice(0, 2);
  const org = row.organizations[0];
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      {top.map((p) => {
        const flagged = p.is_platform_admin || (p.email != null && (TEST_ACCOUNT_EMAILS as readonly string[]).includes(p.email));
        const label = p.email ?? "Unknown person";
        const href = p.person_id
          ? seat === "admin"
            ? usageViewHref("usage_by_person", { person: p.person_id })
            : orgSlug
              ? orgAdminMemberHref(orgSlug, p.person_id)
              : null
          : null;
        return href ? (
          <Link key={p.person_id ?? label} href={href} className={`truncate hover:underline ${flagged ? "text-amber-600" : "text-primary"}`} title={label}>
            {label}
          </Link>
        ) : (
          <span key={label} className="truncate text-muted-foreground">{label}</span>
        );
      })}
      {row.payers.length > 2 && <span className="text-muted-foreground">{`+${row.payers.length - 2} more`}</span>}
      {seat === "admin" && org?.id && (
        <EntityRef token="organization" id={org.id} name={org.name ?? "Organization"} />
      )}
    </div>
  );
}

export function AgentSpendBoard({
  orgId,
  seat,
  orgSlug,
  days,
  onDaysChange,
}: {
  orgId: string | null;
  seat: SpendSeat;
  orgSlug?: string;
  days: SpendWindowDays;
  onDaysChange: (d: SpendWindowDays) => void;
}) {
  const { rows, loading, error, reload } = useAgentSpend(orgId, days);
  const { format } = useCostDisplay();
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const unsaved = rows.reduce((s, r) => s + r.unsaved_cost, 0);

  const columns: MatrxColumnDef<AgentSpendRow>[] = [
    {
      id: "name",
      header: "Agent / mandate",
      accessorFn: (r) => `${r.agent_name ?? ""} ${r.mandate_key ?? ""}`,
      filter: "text",
      width: 260,
      cell: (r) => <SpendSubject row={r} seat={seat} orgSlug={orgSlug} days={days} />,
    },
    {
      id: "flags",
      header: "Flags",
      accessorFn: (r) => agentSpendFlags(r).map((f) => f.label).join(", "),
      filter: "text",
      width: 220,
      cell: (r) => <SpendFlagBadges flags={agentSpendFlags(r)} />,
    },
    {
      id: "models",
      header: "Model",
      accessorFn: (r) => r.models.join(", "),
      filter: "text",
      width: 160,
      cell: (r) => <ModelList models={r.models} premium={r.premium_models} />,
    },
    { id: "runs", accessorKey: "runs", header: "Runs", filter: "number", width: 70 },
    {
      id: "cost",
      accessorKey: "cost",
      header: "Total",
      filter: "number",
      width: 100,
      cell: (r) => <Cost usd={r.cost} className="tabular-nums text-xs font-medium" />,
    },
    {
      id: "avg_run_cost",
      accessorKey: "avg_run_cost",
      header: "Avg / run",
      filter: "number",
      width: 90,
      cell: (r) => <Cost usd={r.avg_run_cost} className={`tabular-nums text-xs ${r.avg_run_cost > 1 ? "font-semibold text-red-600" : ""}`} />,
    },
    {
      id: "max_run_cost",
      accessorKey: "max_run_cost",
      header: "Max / run",
      filter: "number",
      width: 90,
      cell: (r) => <Cost usd={r.max_run_cost} className={`tabular-nums text-xs ${r.max_run_cost > 1 ? "font-semibold text-red-600" : ""}`} />,
    },
    {
      id: "avg_turns",
      accessorKey: "avg_turns",
      header: "Turns avg",
      filter: "number",
      width: 80,
      cell: (r) => <span className={`tabular-nums text-xs ${r.avg_turns > 5 ? "font-semibold text-red-600" : ""}`}>{r.avg_turns}</span>,
    },
    {
      id: "max_turns",
      accessorKey: "max_turns",
      header: "Turns max",
      filter: "number",
      width: 80,
      cell: (r) => <span className={`tabular-nums text-xs ${r.max_turns > 20 ? "font-semibold text-red-600" : ""}`}>{r.max_turns}</span>,
    },
    {
      id: "avg_input_per_call",
      accessorKey: "avg_input_per_call",
      header: "In / call",
      filter: "number",
      width: 90,
      cell: (r) => <span className={`tabular-nums text-xs ${r.avg_input_per_call > 50_000 ? "font-semibold text-amber-600" : ""}`}>{Math.round(r.avg_input_per_call).toLocaleString()}</span>,
    },
    {
      id: "avg_output_per_call",
      accessorKey: "avg_output_per_call",
      header: "Out / call",
      filter: "number",
      width: 90,
      cell: (r) => <span className="tabular-nums text-xs">{Math.round(r.avg_output_per_call).toLocaleString()}</span>,
    },
    {
      id: "automated_share",
      header: "Automated",
      accessorFn: (r) => (r.runs ? Math.round((r.automated_runs / r.runs) * 100) : 0),
      filter: "number",
      width: 90,
      cell: (r) => (
        <span className="tabular-nums text-xs" title={`${r.automated_runs} automated · ${r.runs - r.automated_runs} by a person`}>
          {r.runs ? `${Math.round((r.automated_runs / r.runs) * 100)}%` : "—"}
        </span>
      ),
    },
    {
      id: "unsaved",
      header: "Unsaved",
      accessorFn: (r) => r.unsaved_runs,
      filter: "number",
      width: 80,
      cell: (r) =>
        r.unsaved_runs > 0 ? (
          <span className="tabular-nums text-xs text-amber-600" title={`${r.unsaved_runs} runs with no saved conversation`}>
            {r.unsaved_runs}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">0</span>
        ),
    },
    {
      id: "paid_by",
      header: "Paid by",
      accessorFn: (r) => r.payers.map((p) => p.email ?? "").join(", "),
      filter: "text",
      width: 200,
      cell: (r) => <PaidBy row={r} seat={seat} orgSlug={orgSlug} />,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      )}
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={rowKey}
          isLoading={loading}
          defaultSort={{ id: "cost", direction: "desc" }}
          emptyState={{ title: `No agent spend in ${days} days` }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search agents and mandates…",
            actions: (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {`${format(total)}${unsaved > 0 ? ` · unsaved ${format(unsaved)}` : ""}`}
                </span>
                <SegmentedControl<"7" | "30">
                  aria-label="Window"
                  value={String(days) as "7" | "30"}
                  onValueChange={(v) => onDaysChange(v === "7" ? 7 : 30)}
                  data={[
                    { value: "7", label: "7d" },
                    { value: "30", label: "30d" },
                  ]}
                />
                <Button variant="outline" onClick={reload} disabled={loading} aria-label="Refresh">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Agent spend",
            listLabel: "Agent spend (this view)",
            location: seat === "admin" ? "/administration/usage/agents" : "/organizations/admin/ai-spend",
            rowKind: "agent-spend",
            listKind: "agent-spend",
            humanRow: (r) =>
              [
                `Agent: ${r.agent_name ?? "—"}`,
                r.mandate_key ? `Mandate: ${r.mandate_key}` : null,
                `Models: ${r.models.join(", ") || "not recorded"}`,
                `Runs: ${r.runs}`,
                `Cost: $${r.cost.toFixed(2)} (avg $${r.avg_run_cost.toFixed(2)}, max $${r.max_run_cost.toFixed(2)})`,
                `Turns: avg ${r.avg_turns}, max ${r.max_turns}`,
                `Tokens per call: in ${Math.round(r.avg_input_per_call)}, out ${Math.round(r.avg_output_per_call)}`,
                `Flags: ${agentSpendFlags(r).map((f) => f.label).join(", ") || "none"}`,
              ]
                .filter(Boolean)
                .join("\n"),
          }}
        />
      </div>
    </div>
  );
}
