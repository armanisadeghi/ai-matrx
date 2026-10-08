"use client";

/**
 * THE Triggers manager — every workflow trigger (schedule, event, webhook) that
 * starts AI work on its own, in one table, with what it costs and the red flags
 * from the spend rules, plus Pause / Resume / Archive.
 *
 * seat="admin": every organization (platform admin).
 * seat="org":   one organization, for its admins.
 * A row opens that trigger's runs (cost, turns, model, link to the workflow run).
 * The numbers are the Costs tab's own rollup; this adds creator, created time,
 * last fired, the extra flags, and the controls.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pause, Play, RefreshCw, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import {
  automationFlags,
  type AutomationFlag,
} from "@/features/scheduling/service/automationCosts";
import {
  AutomationCostDetail,
  automationIntervalText,
} from "@/features/scheduling/components/costs/AutomationCostTable";
import {
  RunsAsCell,
  automationCostColumns,
} from "@/features/scheduling/components/costs/AutomationCostColumns";
import {
  fetchManagedTriggers,
  setWorkflowTriggerState,
  triggerExtraFlags,
  type ManagedTrigger,
  type TriggerAction,
} from "@/features/scheduling/service/workflowTriggers";

type AnyFlag = Pick<AutomationFlag, "id" | "label" | "detail" | "severity">;

function allFlags(t: ManagedTrigger): AnyFlag[] {
  return [...triggerExtraFlags(t), ...automationFlags(t.cost)];
}

function FlagBadges({ t }: { t: ManagedTrigger }) {
  const flags = allFlags(t);
  if (flags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1">
      {flags.map((f) => (
        <Tooltip key={f.id}>
          <TooltipTrigger asChild>
            <Badge
              className={`max-w-full ${
                f.severity === "critical"
                  ? "bg-red-600 text-white hover:bg-red-600"
                  : "bg-amber-500 text-white hover:bg-amber-500"
              } text-[10px]`}
            >
              <span className="truncate">{f.label}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{f.detail}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

const ACTION_LABEL: Record<TriggerAction, string> = {
  pause: "Pause",
  resume: "Resume",
  archive: "Archive",
};

function TriggerActions({
  t,
  onAct,
}: {
  t: ManagedTrigger;
  onAct: (t: ManagedTrigger, a: TriggerAction) => void;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className="flex items-center gap-1" onClick={stop} onKeyDown={stop}>
      {t.overview.is_active ? (
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onAct(t, "pause")}>
          <Pause className="h-3 w-3" /> Pause
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onAct(t, "resume")}>
          <Play className="h-3 w-3" /> Resume
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-destructive"
        onClick={() => onAct(t, "archive")}
      >
        <Archive className="h-3 w-3" /> Archive
      </Button>
    </div>
  );
}

export function TriggersManager({
  orgId,
  seat,
  orgSlug,
}: {
  orgId: string | null;
  seat: "admin" | "org";
  orgSlug?: string;
}) {
  const { format } = useCostDisplay();
  const [rows, setRows] = useState<ManagedTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ t: ManagedTrigger; action: TriggerAction } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchManagedTriggers(orgId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await setWorkflowTriggerState(pending.t.overview.trigger_id, pending.action);
      toast.success(
        pending.action === "pause"
          ? "Trigger paused"
          : pending.action === "resume"
            ? "Trigger resumed"
            : "Trigger archived",
      );
      setPending(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const costCols = useMemo(
    () =>
      automationCostColumns<ManagedTrigger>((t) => t.cost, seat, orgSlug).filter((c) =>
        [
          "cost_ai",
          "cost_total",
          "cost_est_month",
          "cost_avg_run",
          "cost_max_run",
          "cost_avg_turns",
          "cost_max_turns",
          "cost_models",
        ].includes(String(c.id)),
      ),
    [seat, orgSlug],
  );

  const columns: MatrxColumnDef<ManagedTrigger>[] = [
    {
      id: "name",
      header: "Trigger",
      accessorFn: (t) => t.cost.name,
      filter: "text",
      width: 280,
      cell: (t) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" title={t.cost.name}>
            {t.cost.name}
          </div>
          {t.overview.definition_id && (
            <Link
              href={`/workflows/${t.overview.definition_id}/triggers`}
              onClick={(e) => e.stopPropagation()}
              className="block truncate text-xs text-primary hover:underline"
              title={t.overview.workflow_name ?? undefined}
            >
              {t.overview.workflow_name ?? "Workflow"}
            </Link>
          )}
        </div>
      ),
    },
    {
      id: "kind",
      header: "Kind",
      accessorFn: (t) => t.overview.kind,
      filter: "select",
      width: 90,
      cell: (t) => <span className="text-xs">{t.overview.kind}</span>,
    },
    {
      id: "cadence",
      header: "Cadence",
      accessorFn: (t) => automationIntervalText(t.cost),
      filter: "text",
      width: 170,
      cell: (t) => (
        <span className="block truncate text-xs" title={automationIntervalText(t.cost)}>
          {automationIntervalText(t.cost)}
        </span>
      ),
    },
    {
      id: "state",
      header: "State",
      accessorFn: (t) => (t.overview.is_active ? "Enabled" : "Paused"),
      filter: "select",
      width: 90,
      cell: (t) => (
        <Badge variant={t.overview.is_active ? "secondary" : "outline"} className="text-[10px]">
          {t.overview.is_active ? "Enabled" : "Paused"}
        </Badge>
      ),
    },
    {
      id: "flags",
      header: "Flags",
      accessorFn: (t) => allFlags(t).map((f) => f.label).join(", "),
      sortValue: (t) => allFlags(t).length,
      filter: "text",
      width: 280,
      cell: (t) => <FlagBadges t={t} />,
    },
    {
      id: "created",
      header: "Created",
      accessorFn: (t) => t.overview.created_at,
      filter: "date",
      width: 190,
      cell: (t) => (
        <div className="min-w-0 text-xs">
          <div className="truncate" title={t.overview.created_by_email ?? undefined}>
            {t.overview.created_by_email ?? "Unknown"}
          </div>
          <div className="text-muted-foreground" title={t.overview.created_at}>
            {humanizeRelative(t.overview.created_at)}
          </div>
        </div>
      ),
    },
    {
      id: "runs_as",
      header: "Runs as / for",
      accessorFn: (t) => `${t.cost.owner_email ?? ""} ${t.cost.organization_name ?? ""}`,
      filter: "text",
      width: 220,
      cell: (t) => <RunsAsCell row={t.cost} />,
    },
    {
      id: "last_fired",
      header: "Last fired",
      accessorFn: (t) => t.overview.last_fired_at ?? "",
      filter: "date",
      width: 120,
      cell: (t) =>
        t.overview.last_fired_at ? (
          <span className="text-xs" title={t.overview.last_fired_at}>
            {humanizeRelative(t.overview.last_fired_at)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Never</span>
        ),
    },
    {
      id: "runs_7d",
      header: "Runs 7d",
      accessorFn: (t) => t.cost.runs_7d,
      filter: "number",
      width: 80,
      cell: (t) => <span className="text-xs tabular-nums">{t.cost.runs_7d}</span>,
    },
    {
      id: "runs_30d",
      header: "Runs 30d",
      accessorFn: (t) => t.cost.runs,
      filter: "number",
      width: 85,
      cell: (t) => <span className="text-xs tabular-nums">{t.cost.runs}</span>,
    },
    ...costCols,
    {
      id: "actions",
      header: "Actions",
      accessorFn: () => "",
      width: 190,
      cell: (t) => <TriggerActions t={t} onAct={(tr, a) => setPending({ t: tr, action: a })} />,
    },
  ];

  const total = rows.reduce((s, r) => s + r.cost.cost, 0);
  const monthly = rows.reduce((s, r) => s + (r.overview.is_active ? r.cost.est_monthly_cost : 0), 0);
  const where = pending
    ? `${pending.t.cost.owner_email ?? "an unknown account"} for ${pending.t.cost.organization_name ?? "no organization"}`
    : "";

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
          getRowId={(t) => t.overview.trigger_id}
          isLoading={loading}
          defaultSort={{ id: "cost_total", direction: "desc" }}
          emptyState={{ title: "No workflow triggers" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search triggers…",
            actions: (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {`${rows.length} triggers · 30d ${format(total)} · est. ${format(monthly)}/mo`}
                </span>
                <Button variant="outline" onClick={() => void load()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Trigger",
            listLabel: "Workflow triggers (this view)",
            location: triggerLocation(seat, orgSlug),
            rowKind: "workflow-trigger",
            listKind: "workflow-triggers",
            humanRow: (t) =>
              [
                `Trigger: ${t.cost.name} (${t.overview.kind}, ${t.overview.is_active ? "enabled" : "paused"})`,
                `Created by ${t.overview.created_by_email ?? "?"} ${t.overview.created_at} · last fired ${t.overview.last_fired_at ?? "never"}`,
                `Runs 7d/30d: ${t.cost.runs_7d}/${t.cost.runs} · cost 30d ${format(t.cost.cost)} · est/month ${format(t.cost.est_monthly_cost)}`,
                `Flags: ${allFlags(t).map((f) => f.label).join(", ") || "none"}`,
              ].join("\n"),
          }}
          detail={{
            title: (t) => t.cost.name,
            description: (t) => t.overview.workflow_name ?? undefined,
            render: (t) => (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <TriggerActions t={t} onAct={(tr, a) => setPending({ t: tr, action: a })} />
                  <span className="text-xs text-muted-foreground">
                    {`Created ${humanizeRelative(t.overview.created_at)} by ${t.overview.created_by_email ?? "unknown"} · fired ${t.overview.fire_count} times`}
                  </span>
                </div>
                <FlagBadges t={t} />
                <AutomationCostDetail row={t.cost} seat={seat} orgSlug={orgSlug} />
              </div>
            ),
            defaultWidth: 720,
          }}
        />
      </div>

      <ConfirmDialog
        open={pending != null}
        onOpenChange={(o) => !busy && !o && setPending(null)}
        title={pending ? `${ACTION_LABEL[pending.action]} "${pending.t.cost.name}"?` : ""}
        description={pending ? consequence(pending.action, pending.t, where, format) : undefined}
        confirmLabel={pending ? ACTION_LABEL[pending.action] : "Confirm"}
        variant={pending?.action === "archive" ? "destructive" : "default"}
        busy={busy}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}

function triggerLocation(seat: "admin" | "org", orgSlug?: string) {
  return seat === "admin" || !orgSlug
    ? "/administration/automation/scheduling/triggers"
    : `/organizations/${orgSlug}/admin/triggers`;
}

function consequence(
  action: TriggerAction,
  t: ManagedTrigger,
  where: string,
  format: (n: number) => string,
): string {
  if (action === "pause") {
    return `This trigger stops firing on its own right now. Runs already started finish. Nothing is deleted and Resume turns it back on. Today it runs ${t.cost.runs_7d} times a week as ${where}, about ${format(t.cost.est_monthly_cost)} a month.`;
  }
  if (action === "resume") {
    return `This trigger starts firing on its own again (${automationIntervalText(t.cost)}) as ${where}. Spend resumes at its recent rate, about ${format(t.cost.est_monthly_cost)} a month. If a run came due while it was paused it may fire once right away.`;
  }
  return `This trigger stops firing and disappears from this list. Its past runs and costs stay on record. It is archived, not erased, and cannot be turned back on from this page.`;
}
