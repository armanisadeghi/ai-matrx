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
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { humanizeRelative, humanizeTrigger } from "@/features/scheduling/utils/triggerHumanize";
import type { TriggerType } from "@/features/scheduling/types";
import { adminScheduleHref, scheduleHref } from "@/features/scheduling/constants/routes";
import {
  AUTOMATION_COST_WINDOW_DAYS,
  AUTOMATION_KIND_LABEL,
  automationCostDetailHref,
  orgAutomationCostDetailHref,
  conversationHref,
  fetchAutomationCosts,
  fetchAutomationRuns,
  workflowRunHref,
  type AutomationCostRow,
  type AutomationRunCost,
  type AutomationSeat,
} from "@/features/scheduling/service/automationCosts";
import {
  AUTOMATION_LEAD_COLUMNS,
  AgentMandateLinks,
  AutomationFlagStrip,
  automationCostColumns,
} from "./AutomationCostColumns";
import { AdminPoints, AdminUsd, CostFigures, UsdOnly } from "@/components/cost/AdminCost";
import { formatAdminUsd } from "@/components/cost/formatAdminCost";
import { currentSeesDollars } from "@/components/cost/costUnit";
import { formatCount } from "@ai-matrx/kit/format";
import { adminCostColumns } from "@/components/cost/adminCostColumns";

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
  orgSlug?: string;
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
    ...adminCostColumns<AutomationRunCost>({ id: "cost", label: "Cost", value: (r) => r.cost }),
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
      id: "served",
      header: "Served",
      accessorFn: (r) => r.served_orgs.map((o) => o.organization_name ?? o.organization_id).join(", "),
      filter: "text",
      width: 200,
      cell: (r) =>
        r.served_orgs.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col gap-0.5 text-xs">
            {r.served_orgs.map((o) => (
              <span key={o.organization_id} className="truncate" title={o.organization_id}>
                {o.organization_name ?? o.organization_id}
                {r.served_orgs.length > 1 && (
                  <span className="ml-1 tabular-nums text-muted-foreground">{format(o.cost)}</span>
                )}
              </span>
            ))}
          </div>
        ),
    },
    {
      id: "models",
      header: "Models",
      accessorFn: (r) => r.models.join(", "),
      filter: "text",
      width: 200,
      cell: (r) =>
        r.turns === 0 && r.models.length === 0 ? (
          <span className="text-xs text-muted-foreground">No AI calls</span>
        ) : (
          <span className="text-xs">{r.models.join(", ") || "—"}</span>
        ),
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
          {r.conversation_id &&
            (seat === "org" ? (
              // The run's conversation belongs to whoever the job runs as; the
              // canonical ref opens it where the viewer may, and says so where not.
              <EntityRef token="conversation" id={r.conversation_id} name="Conversation" />
            ) : (
              <Link href={conversationHref(r.conversation_id, seat)} className="inline-flex items-center gap-1 text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Conversation
              </Link>
            ))}
          {r.workflow_run_id && (
            <Link href={workflowRunHref(r.workflow_run_id)} className="inline-flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> Workflow run
            </Link>
          )}
          {!r.conversation_id && !r.workflow_run_id && (
            <span className="text-muted-foreground">No AI calls</span>
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
            currentSeesDollars() ? `Cost: ${formatAdminUsd(r.cost)}` : null,
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
  orgSlug,
}: {
  row: AutomationCostRow;
  seat: AutomationSeat;
  orgSlug?: string;
}) {
  const { format } = useCostDisplay();
  // The schedule / workflow record pages are the owner's and the platform
  // admin's; an org admin's record for this automation is the page they are on.
  const recordHref = seat === "admin" ? automationRecordHref(row, seat) : null;
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
      <AutomationFlagStrip row={row} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <UsdOnly><Stat label="Cost 30d $"><AdminUsd usd={row.cost} /></Stat></UsdOnly>
        <Stat label="Points 30d"><AdminPoints usd={row.cost} /></Stat>
        <UsdOnly><Stat label="Cost 7d $"><AdminUsd usd={row.cost_7d} /></Stat></UsdOnly>
        <Stat label="Points 7d"><AdminPoints usd={row.cost_7d} /></Stat>
        <UsdOnly><Stat label="Est./month $"><AdminUsd usd={row.est_monthly_cost} /></Stat></UsdOnly>
        <Stat label="Est./month points"><AdminPoints usd={row.est_monthly_cost} /></Stat>
        <Stat label="Runs 30d">{formatCount(row.runs)}</Stat>
        <UsdOnly><Stat label="Last run $"><AdminUsd usd={row.last_run_cost} /></Stat></UsdOnly>
        <Stat label="Last run points"><AdminPoints usd={row.last_run_cost} /></Stat>
        <UsdOnly><Stat label="Avg cost/run $"><AdminUsd usd={row.avg_run_cost} /></Stat></UsdOnly>
        <Stat label="Avg cost/run points"><AdminPoints usd={row.avg_run_cost} /></Stat>
        <UsdOnly><Stat label="Max cost/run $"><AdminUsd usd={row.max_run_cost} /></Stat></UsdOnly>
        <Stat label="Max cost/run points"><AdminPoints usd={row.max_run_cost} /></Stat>
        <Stat label="Avg turns">{row.avg_turns}</Stat>
        <Stat label="Max turns">{row.max_turns}</Stat>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Runs as</div>
          <div className="truncate text-xs">{row.owner_email ?? "Unknown account"}</div>
          <div className="mb-1 mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">For org</div>
          <div className="truncate text-xs">{row.organization_name ?? "No organization"}</div>
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
          <AgentMandateLinks row={row} seat={seat} orgSlug={orgSlug} />
        </div>
      </div>
      <AutomationRunsTable row={row} seat={seat} orgSlug={orgSlug} />
    </div>
  );
}

export function AutomationCostTable({
  orgId,
  seat,
  orgSlug,
}: {
  orgId: string | null;
  seat: AutomationSeat;
  /** Org seat: the organization's slug, for the org-side detail and mandate pages. */
  orgSlug?: string;
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
      width: 240,
      cell: (r) => (
        <Link
          href={
            seat === "admin" || !orgSlug
              ? automationCostDetailHref(r.automation_kind, r.automation_id)
              : orgAutomationCostDetailHref(orgSlug, r.automation_kind, r.automation_id)
          }
          className="block truncate font-medium text-primary hover:underline"
          title={r.name}
        >
          {r.name}
        </Link>
      ),
    },
    ...automationCostColumns<AutomationCostRow>((r) => r, seat, orgSlug).slice(0, AUTOMATION_LEAD_COLUMNS),
    {
      id: "cadence",
      header: "Cadence",
      accessorFn: (r) => automationIntervalText(r),
      filter: "text",
      width: 170,
      cell: (r) => (
        <span className="block truncate text-xs" title={automationIntervalText(r)}>
          {automationIntervalText(r)}
        </span>
      ),
    },
    {
      id: "kind",
      header: "Kind",
      accessorFn: (r) => AUTOMATION_KIND_LABEL[r.automation_kind],
      filter: "select",
      width: 130,
      cell: (r) => <span className="whitespace-nowrap text-xs">{AUTOMATION_KIND_LABEL[r.automation_kind]}</span>,
    },
    {
      id: "enabled",
      header: "State",
      accessorFn: (r) => (r.enabled ? "Enabled" : "Off"),
      filter: "select",
      width: 80,
      cell: (r) => <span className={`text-xs ${r.enabled ? "" : "text-muted-foreground"}`}>{r.enabled ? "Enabled" : "Off"}</span>,
    },
    {
      id: "approved_by",
      header: "Approved by",
      accessorFn: (r) => r.approved_by ?? "",
      filter: "text",
      width: 160,
      hidden: true,
      cell: (r) => <span className="block truncate text-xs" title={r.approved_by ?? undefined}>{r.approved_by ?? "—"}</span>,
    },
    {
      id: "approved_at",
      header: "Approved at",
      accessorFn: (r) => r.approved_at ?? "",
      filter: "date",
      width: 120,
      hidden: true,
      cell: (r) =>
        r.approved_at ? <span className="text-xs" title={r.approved_at}>{humanizeRelative(r.approved_at)}</span> : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      id: "approval_record",
      header: "Schedule approval",
      accessorFn: (r) => r.approval ?? "",
      filter: "text",
      width: 200,
      hidden: true,
      cell: (r) => <span className="block truncate text-xs" title={r.approval ?? undefined}>{r.approval ?? "—"}</span>,
    },
    ...automationCostColumns<AutomationCostRow>((r) => r, seat, orgSlug).slice(AUTOMATION_LEAD_COLUMNS),
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
                <CostFigures
                  items={[
                    { usdLabel: `Cost ${AUTOMATION_COST_WINDOW_DAYS}d`, pointsLabel: `Points ${AUTOMATION_COST_WINDOW_DAYS}d`, usd: total },
                    { usdLabel: "Est./month $", pointsLabel: "Est./month points", usd: monthly },
                  ]}
                />
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
            render: (r) => <AutomationCostDetail row={r} seat={seat} orgSlug={orgSlug} />,
            defaultWidth: 720,
          }}
        />
      </div>
    </div>
  );
}
