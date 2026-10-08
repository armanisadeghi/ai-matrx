"use client";

/**
 * Every automation the viewer may see, with what it costs and how it behaves.
 * seat="admin": every organization (admin lane). seat="org": one organization.
 * A row opens the record panel with its runs; each run opens its conversation
 * or workflow run.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { humanizeRelative, humanizeTrigger } from "@/features/scheduling/utils/triggerHumanize";
import type { TriggerType } from "@/features/scheduling/types";
import { adminScheduleHref, scheduleHref } from "@/features/scheduling/constants/routes";
import {
  AUTOMATION_COST_WINDOW_DAYS,
  AUTOMATION_KIND_LABEL,
  automationCostDetailHref,
  conversationHref,
  fetchAutomationCosts,
  fetchAutomationRuns,
  workflowRunHref,
  type AutomationCostRow,
  type AutomationRunCost,
  type AutomationSeat,
} from "@/features/scheduling/service/automationCosts";
import {
  AgentMandateLinks,
  AutomationFlagBadges,
  RunsAsCell,
  automationCostColumns,
} from "./AutomationCostColumns";

export function automationIntervalText(r: AutomationCostRow): string {
  if (!r.trigger_type) return "—";
  if (r.automation_kind === "workflow_trigger") {
    const cron = r.trigger_config?.cron;
    return typeof cron === "string" ? `${r.trigger_type}: ${cron}` : r.trigger_type;
  }
  try {
    return humanizeTrigger(r.trigger_type as TriggerType, r.trigger_config ?? {});
  } catch {
    return r.trigger_type;
  }
}

/** The record each automation is — its own page, by seat. */
export function automationRecordHref(r: AutomationCostRow, seat: AutomationSeat): string | null {
  if (r.automation_kind === "workflow_trigger") {
    return r.workflow_definition_id ? `/workflows/${r.workflow_definition_id}` : null;
  }
  return seat === "admin" ? adminScheduleHref(r.automation_id) : scheduleHref(r.automation_id);
}

export function useAutomationCosts(orgId: string | null) {
  const [rows, setRows] = useState<AutomationCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAutomationCosts(orgId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, loading, error, reload: load };
}

export function AutomationRunsTable({
  row,
  seat,
}: {
  row: Pick<AutomationCostRow, "automation_kind" | "automation_id">;
  seat: AutomationSeat;
}) {
  const { format } = useCostDisplay();
  const [runs, setRuns] = useState<AutomationRunCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchAutomationRuns(row.automation_kind, row.automation_id)
      .then((r) => live && setRuns(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [row.automation_kind, row.automation_id]);

  const columns: MatrxColumnDef<AutomationRunCost>[] = [
    {
      id: "run_at",
      accessorKey: "run_at",
      header: "When",
      filter: "date",
      width: 120,
      cell: (r) => <span className="text-xs" title={r.run_at}>{humanizeRelative(r.run_at)}</span>,
    },
    { id: "status", accessorKey: "status", header: "Status", filter: "select", width: 100 },
    {
      id: "cost",
      accessorKey: "cost",
      header: "Cost",
      filter: "number",
      width: 100,
      cell: (r) => (
        <span className={`tabular-nums text-xs ${r.cost > 1 ? "font-semibold text-red-600" : ""}`}>
          {format(r.cost)}
        </span>
      ),
    },
    {
      id: "turns",
      accessorKey: "turns",
      header: "Turns",
      filter: "number",
      width: 80,
      cell: (r) => (
        <span className={`tabular-nums text-xs ${r.turns > 20 ? "font-semibold text-red-600" : ""}`}>
          {r.turns}
        </span>
      ),
    },
    { id: "max_loop", accessorKey: "max_loop", header: "Max loop", filter: "number", width: 90 },
    {
      id: "models",
      header: "Models",
      accessorFn: (r) => r.models.join(", "),
      filter: "text",
      width: 200,
      cell: (r) => <span className="text-xs">{r.models.join(", ") || "—"}</span>,
    },
    {
      id: "mandates",
      header: "Mandates",
      accessorFn: (r) => r.mandates.join(", "),
      filter: "text",
      width: 180,
      cell: (r) => <span className="text-xs">{r.mandates.join(", ") || "—"}</span>,
    },
    {
      id: "open",
      header: "Open",
      accessorFn: (r) => r.conversation_id ?? r.workflow_run_id ?? "",
      filter: false,
      sortable: false,
      width: 150,
      cell: (r) => (
        <div className="flex flex-col gap-0.5 text-xs">
          {r.conversation_id && (
            <Link href={conversationHref(r.conversation_id, seat)} className="inline-flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Conversation
            </Link>
          )}
          {r.workflow_run_id && (
            <Link href={workflowRunHref(r.workflow_run_id)} className="inline-flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Workflow run
            </Link>
          )}
          {!r.conversation_id && !r.workflow_run_id && (
            <span className="text-muted-foreground">No model call</span>
          )}
        </div>
      ),
    },
  ];

  if (error) {
    return (
      <div className="text-sm text-destructive">
        {error}
        <ErrorAlchemyMenu error={error} />
      </div>
    );
  }
  return (
    <MatrxDataTable
      data={runs}
      columns={columns}
      getRowId={(r) => r.run_id}
      isLoading={loading}
      defaultSort={{ id: "run_at", direction: "desc" }}
      emptyState={{ title: `No runs in ${AUTOMATION_COST_WINDOW_DAYS} days` }}
      frameHeight="content"
      copy={{
        label: "Automation run",
        listLabel: "Automation runs",
        location: "/administration/automation/scheduling/costs",
        rowKind: "automation-run",
        listKind: "automation-runs",
        humanRow: (r) =>
          [
            `Run: ${r.run_id}`,
            `When: ${r.run_at}`,
            `Status: ${r.status ?? "unknown"}`,
            `Cost: $${r.cost.toFixed(4)}`,
            `Turns: ${r.turns}`,
            r.models.length ? `Models: ${r.models.join(", ")}` : null,
            r.mandates.length ? `Jobs: ${r.mandates.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
      }}
    />
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{children}</div>
    </div>
  );
}

/** One automation: its numbers, flags, links and every run. */
export function AutomationCostDetail({
  row,
  seat,
}: {
  row: AutomationCostRow;
  seat: AutomationSeat;
}) {
  const { format } = useCostDisplay();
  const recordHref = automationRecordHref(row, seat);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="text-[10px]">{AUTOMATION_KIND_LABEL[row.automation_kind]}</Badge>
        <Badge variant={row.enabled ? "secondary" : "outline"} className="text-[10px]">
          {row.enabled ? "Enabled" : "Off"}
        </Badge>
        <span className="text-muted-foreground">{automationIntervalText(row)}</span>
        {recordHref && (
          <Link href={recordHref} className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> Open schedule
          </Link>
        )}
      </div>
      <AutomationFlagBadges row={row} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cost 30d">{format(row.cost)}</Stat>
        <Stat label="Cost 7d">{format(row.cost_7d)}</Stat>
        <Stat label="Est. / month">{format(row.est_monthly_cost)}</Stat>
        <Stat label="Runs 30d">{row.runs.toLocaleString()}</Stat>
        <Stat label="Last run">{row.last_run_cost == null ? "—" : format(row.last_run_cost)}</Stat>
        <Stat label="Avg / run">{row.avg_run_cost == null ? "—" : format(row.avg_run_cost)}</Stat>
        <Stat label="Max / run">{row.max_run_cost == null ? "—" : format(row.max_run_cost)}</Stat>
        <Stat label="Turns avg / max">{`${row.avg_turns} / ${row.max_turns}`}</Stat>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Runs as / for</div>
          <RunsAsCell row={row} />
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Approval</div>
          <div className="text-xs">
            {row.approval ?? (row.approved_by ? `Approved by ${row.approved_by}` : "No approval recorded")}
            {row.approved_at ? ` · ${row.approved_at}` : ""}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Models</div>
          <div className="text-xs">{row.models.join(", ") || "—"}</div>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Mandates & agents</div>
          <AgentMandateLinks row={row} seat={seat} />
        </div>
      </div>
      <AutomationRunsTable row={row} seat={seat} />
    </div>
  );
}

export function AutomationCostTable({
  orgId,
  seat,
}: {
  orgId: string | null;
  seat: AutomationSeat;
}) {
  const { rows, loading, error, reload } = useAutomationCosts(orgId);
  const { format } = useCostDisplay();
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const monthly = rows.reduce((s, r) => s + r.est_monthly_cost, 0);

  const columns: MatrxColumnDef<AutomationCostRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Automation",
      filter: "text",
      width: 280,
      cell: (r) => (
        <div className="min-w-0">
          {seat === "admin" ? (
            <Link href={automationCostDetailHref(r.automation_kind, r.automation_id)} className="font-medium text-primary hover:underline">
              {r.name}
            </Link>
          ) : (
            <span className="font-medium">{r.name}</span>
          )}
          <div className="text-xs text-muted-foreground">{automationIntervalText(r)}</div>
        </div>
      ),
    },
    {
      id: "kind",
      header: "Kind",
      accessorFn: (r) => AUTOMATION_KIND_LABEL[r.automation_kind],
      filter: "select",
      width: 130,
      cell: (r) => <span className="text-xs">{AUTOMATION_KIND_LABEL[r.automation_kind]}</span>,
    },
    {
      id: "enabled",
      header: "State",
      accessorFn: (r) => (r.enabled ? "Enabled" : "Off"),
      filter: "select",
      width: 90,
      cell: (r) => (
        <Badge variant={r.enabled ? "secondary" : "outline"} className="text-[10px]">
          {r.enabled ? "Enabled" : "Off"}
        </Badge>
      ),
    },
    {
      id: "approved",
      header: "Approved",
      accessorFn: (r) => r.approval ?? r.approved_by ?? "",
      filter: "text",
      width: 160,
      cell: (r) => (
        <span className="line-clamp-2 text-xs" title={r.approval ?? undefined}>
          {r.approval ?? r.approved_by ?? "—"}
        </span>
      ),
    },
    ...automationCostColumns<AutomationCostRow>((r) => r, seat),
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
          getRowId={(r) => `${r.automation_kind}:${r.automation_id}`}
          isLoading={loading}
          defaultSort={{ id: "cost_total", direction: "desc" }}
          emptyState={{ title: "No automations" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search automations…",
            actions: (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {`${AUTOMATION_COST_WINDOW_DAYS}d ${format(total)} · est. ${format(monthly)}/mo`}
                </span>
                <Button variant="outline" onClick={() => void reload()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Automation",
            listLabel: "Automations (this view)",
            location: seat === "admin" ? "/administration/automation/scheduling/costs" : "/organizations/admin",
            rowKind: "automation-cost",
            listKind: "automation-costs",
            humanRow: (r) =>
              [
                `Automation: ${r.name} (${AUTOMATION_KIND_LABEL[r.automation_kind]})`,
                `Runs 30d: ${r.runs} · cost ${format(r.cost)} · avg/run ${r.avg_run_cost == null ? "—" : format(r.avg_run_cost)} · est/month ${format(r.est_monthly_cost)}`,
                `Turns avg/max: ${r.avg_turns}/${r.max_turns} · models: ${r.models.join(", ") || "—"}`,
                `Runs as ${r.owner_email ?? "?"} for ${r.organization_name ?? "?"}`,
              ].join("\n"),
          }}
          detail={{
            title: (r) => r.name,
            description: (r) => r.description ?? undefined,
            render: (r) => <AutomationCostDetail row={r} seat={seat} />,
            defaultWidth: 720,
          }}
        />
      </div>
    </div>
  );
}
