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
import { useAutomationReadiness } from "@/features/scheduling/service/automationReadiness";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Pause, Play, RefreshCw, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TRIGGER_FLAG_SET, SpendFlagStrip, spendFlagColumn, type SpendFlagHit } from "@/components/cost/SpendFlagStrip";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { TapTargetButtonTransparent, TapTargetCopyButton } from "@ai-matrx/design-system/tap-target";
import { PauseTapButton, PlayTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { AdminPoints, AdminUsd, CostFigures, UsdOnly } from "@/components/cost/AdminCost";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import { automationAiState } from "@/features/scheduling/service/automationCosts";
import { automationIntervalText } from "@/features/scheduling/components/costs/AutomationCostTable";
import { TriggerRunsTable } from "./TriggerRunsTable";
import {
  automationCostColumns,
  automationFlagHits,
} from "@/features/scheduling/components/costs/AutomationCostColumns";
import {
  fetchManagedTriggers,
  setWorkflowTriggerState,
  triggerExtraFlags,
  triggerIdSuffix,
  triggerWorkflowHref,
  type ManagedTrigger,
  type TriggerAction,
} from "@/features/scheduling/service/workflowTriggers";

const RANK: Record<SpendFlagHit["severity"], number> = { critical: 3, warning: 2, info: 1, hint: 0 };

/** Every flag a trigger raises, one per icon slot (the stronger wins when two rules share a slot). */
function triggerHits(t: ManagedTrigger): SpendFlagHit[] {
  const raw: SpendFlagHit[] = [
    ...triggerExtraFlags(t).map((f) => ({
      slot: f.id === "test_looking_name" ? ("disposable" as const) : f.id,
      severity: f.severity,
      detail: f.detail,
    })),
    ...automationFlagHits(t.cost),
  ];
  const bySlot = new Map<string, SpendFlagHit>();
  for (const h of raw) {
    const prev = bySlot.get(h.slot);
    if (!prev || RANK[h.severity] > RANK[prev.severity]) bySlot.set(h.slot, h);
  }
  return [...bySlot.values()];
}

function FlagStrip({ t }: { t: ManagedTrigger }) {
  return <SpendFlagStrip set={TRIGGER_FLAG_SET} hits={triggerHits(t)} />;
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium tabular-nums">{children}</div>
    </div>
  );
}

function TriggerStats({ t }: { t: ManagedTrigger }) {
  const c = t.cost;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <UsdOnly><Stat label="Cost 30d $"><AdminUsd usd={c.cost} /></Stat></UsdOnly>
      <Stat label="Points 30d"><AdminPoints usd={c.cost} /></Stat>
      <UsdOnly><Stat label="Est./month $"><AdminUsd usd={c.est_monthly_cost} /></Stat></UsdOnly>
      <Stat label="Est./month points"><AdminPoints usd={c.est_monthly_cost} /></Stat>
      <Stat label="Runs 7d">{c.runs_7d}</Stat>
      <Stat label="Runs 30d">{c.runs}</Stat>
      <Stat label="Avg turns">{c.avg_turns}</Stat>
      <Stat label="Max turns">{c.max_turns}</Stat>
      <UsdOnly><Stat label="Avg cost/run $"><AdminUsd usd={c.avg_run_cost} /></Stat></UsdOnly>
      <Stat label="Avg cost/run points"><AdminPoints usd={c.avg_run_cost} /></Stat>
      <UsdOnly><Stat label="Max cost/run $"><AdminUsd usd={c.max_run_cost} /></Stat></UsdOnly>
      <Stat label="Max cost/run points"><AdminPoints usd={c.max_run_cost} /></Stat>
      <Stat label="Runs as">{c.owner_email ?? "Unknown"}</Stat>
      <Stat label="For">{c.organization_name ?? "No organization"}</Stat>
      <div className="col-span-2 min-w-0 sm:col-span-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Approval</div>
        <div className="text-xs">{c.approval ?? c.approved_by ?? "No approval recorded"}</div>
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-4">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Models</div>
        <div className="flex flex-wrap gap-1">
          {c.models.length === 0 && <span className="text-xs">—</span>}
          {c.models.map((m) => (
            <Badge
              key={m}
              variant="outline"
              className={`max-w-full text-[10px] ${c.premium_models.includes(m) ? "border-red-500 text-red-700 dark:text-red-400" : ""}`}
            >
              <span className="truncate">{m}</span>
            </Badge>
          ))}
        </div>
      </div>
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
    <div className="flex items-center gap-0.5" onClick={stop} onKeyDown={stop}>
      <TapTargetCopyButton
        variant="transparent"
        value={`${t.cost.name} (${t.overview.trigger_id})`}
        tooltip="Copy name and id"
        ariaLabel={`Copy ${t.cost.name}`}
      />
      {t.overview.is_active ? (
        <PauseTapButton
          variant="transparent"
          tooltip="Pause"
          ariaLabel={`Pause ${t.cost.name}`}
          onClick={() => onAct(t, "pause")}
        />
      ) : (
        <PlayTapButton
          variant="transparent"
          tooltip="Resume"
          ariaLabel={`Resume ${t.cost.name}`}
          onClick={() => onAct(t, "resume")}
        />
      )}
      <TapTargetButtonTransparent
        icon={<Archive />}
        tooltip="Archive"
        ariaLabel={`Archive ${t.cost.name}`}
        onClick={() => onAct(t, "archive")}
      />
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
  useAutomationReadiness(); // re-renders the "Not ready" flag once the verdicts land
  const [rows, setRows] = useState<ManagedTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ t: ManagedTrigger; action: TriggerAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiOnly, setAiOnly] = useState(true);

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

  const costCols = automationCostColumns<ManagedTrigger>((t) => t.cost, seat, orgSlug);
  const pick = (ids: string[]) => ids.flatMap((id) => costCols.filter((c) => String(c.id) === id));

  const unordered: MatrxColumnDef<ManagedTrigger>[] = [
    {
      id: "name",
      header: "Trigger",
      accessorFn: (t) => t.cost.name,
      filter: "text",
      width: 240,
      cell: (t) => (
        <span className="block truncate text-sm font-medium" title={t.cost.name}>
          {t.cost.name}
        </span>
      ),
    },
    {
      id: "trigger_id",
      header: "ID",
      accessorFn: (t) => triggerIdSuffix(t.overview.trigger_id),
      filter: "text",
      width: 80,
      cell: (t) => (
        <span className="font-mono text-xs text-muted-foreground" title={t.overview.trigger_id}>
          {`#${triggerIdSuffix(t.overview.trigger_id)}`}
        </span>
      ),
    },
    {
      id: "workflow",
      header: "Workflow",
      accessorFn: (t) => t.overview.workflow_name ?? "",
      filter: "text",
      width: 200,
      cell: (t) => {
        if (!t.overview.definition_id) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <Link
            href={triggerWorkflowHref(seat, t.overview.definition_id)}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-xs text-primary hover:underline"
            title={t.overview.workflow_name ?? undefined}
          >
            {t.overview.workflow_name ?? "Workflow"}
          </Link>
        );
      },
    },
    ...pick(["cost_mandate", "cost_agent"]),
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
      width: 80,
      cell: (t) => (
        <span className={`text-xs ${t.overview.is_active ? "" : "text-muted-foreground"}`}>
          {t.overview.is_active ? "Enabled" : "Paused"}
        </span>
      ),
    },
    ...pick(["cost_ai"]),
    spendFlagColumn<ManagedTrigger>(TRIGGER_FLAG_SET, triggerHits),
    ...pick(["cost_approval"]),
    ...pick(["cost_total", "cost_total_points", "cost_est_month", "cost_est_month_points"]),
    {
      id: "runs_7d",
      header: "Runs 7d",
      accessorFn: (t) => t.cost.runs_7d,
      filter: "number",
      align: "right",
      width: 80,
      cell: (t) => <span className="text-xs tabular-nums">{t.cost.runs_7d}</span>,
    },
    {
      id: "runs_30d",
      header: "Runs 30d",
      accessorFn: (t) => t.cost.runs,
      filter: "number",
      align: "right",
      compact: true,
      width: 85,
      cell: (t) => <span className="text-xs tabular-nums">{t.cost.runs}</span>,
    },
    {
      id: "last_fired",
      header: "Last fired",
      accessorFn: (t) => t.overview.last_fired_at ?? "",
      filter: "date",
      width: 110,
      cell: (t) =>
        t.overview.last_fired_at ? (
          <span className="text-xs" title={t.overview.last_fired_at}>
            {humanizeRelative(t.overview.last_fired_at)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Never</span>
        ),
    },
    ...pick([
      "cost_avg_run",
      "cost_avg_run_points",
      "cost_max_run",
      "cost_max_run_points",
      "cost_avg_turns",
      "cost_max_turns",
      "cost_models",
      "cost_runs_as",
      "cost_for_org",
    ]),
    {
      id: "created_by",
      header: "Created by",
      accessorFn: (t) => t.overview.created_by_email ?? "",
      filter: "text",
      width: 190,
      hidden: true,
      cell: (t) => (
        <span className="block truncate text-xs" title={t.overview.created_by_email ?? undefined}>
          {t.overview.created_by_email ?? "Unknown"}
        </span>
      ),
    },
    {
      id: "created_at",
      header: "Created at",
      accessorFn: (t) => t.overview.created_at,
      filter: "date",
      width: 110,
      hidden: true,
      cell: (t) => (
        <span className="text-xs" title={t.overview.created_at}>
          {humanizeRelative(t.overview.created_at)}
        </span>
      ),
    },
    ...pick(["cost_7d", "cost_7d_points", "cost_last_run", "cost_last_run_points"]),
  ];
  // Money right after who does the work (owner, 2026-10-08); description after it.
  const ORDER = [
    "name", "cost_mandate", "cost_agent", "cost_total", "cost_total_points", "runs_30d",
    "cost_avg_run", "cost_avg_run_points", "flags", "cost_approval", "cost_ai",
    "workflow", "trigger_id", "kind", "cadence", "state", "cost_est_month", "cost_est_month_points",
    "runs_7d", "last_fired",
  ];
  const columns: MatrxColumnDef<ManagedTrigger>[] = [
    ...ORDER.flatMap((id) => unordered.filter((c) => String(c.id) === id)),
    ...unordered.filter((c) => !ORDER.includes(String(c.id))),
  ];

  // "AI only" hides triggers that ran and spent nothing on AI. A trigger that has
  // never run stays listed: it may still spend the first time it fires.
  const hidden = rows.filter((r) => automationAiState(r.cost) === "no_spend");
  const shown = aiOnly ? rows.filter((r) => automationAiState(r.cost) !== "no_spend") : rows;
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
          data={shown}
          columns={columns}
          getRowId={(t) => t.overview.trigger_id}
          rowActions={(t) => [
            t.overview.is_active
              ? { id: "pause", icon: Pause, label: "Pause", tooltip: "Pause", onClick: () => setPending({ t, action: "pause" }) }
              : { id: "resume", icon: Play, label: "Resume", tooltip: "Resume", onClick: () => setPending({ t, action: "resume" }) },
            { id: "archive", icon: Archive, label: "Archive", tooltip: "Archive", onClick: () => setPending({ t, action: "archive" }) },
          ]}
          isLoading={loading}
          defaultSort={{ id: "cost_total", direction: "desc" }}
          emptyState={{ title: "No workflow triggers" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search triggers…",
            actions: (
              <div className="flex items-center gap-2">
                <Button variant={aiOnly ? "quiet" : "outline"} aria-pressed={aiOnly} onClick={() => setAiOnly((v) => !v)}>
                  {aiOnly ? `AI only (${hidden.length} hidden)` : "Showing all"}
                </Button>
                <span className="whitespace-nowrap text-xs text-muted-foreground">{`${shown.length} triggers`}</span>
                <CostFigures
                  items={[
                    { usdLabel: "Cost 30d", pointsLabel: "Points 30d", usd: total },
                    { usdLabel: "Est./month $", pointsLabel: "Est./month points", usd: monthly },
                  ]}
                />
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
                `Flags: ${triggerHits(t).map((h) => h.detail ?? h.slot).join("; ") || "none"}`,
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
                <FlagStrip t={t} />
                <TriggerStats t={t} />
                <TriggerRunsTable triggerId={t.overview.trigger_id} seat={seat} orgSlug={orgSlug} />
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
