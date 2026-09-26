"use client";

/**
 * The topic cost surface: what the run consumed, phase by phase, model by
 * model, and call by call.
 *
 * Cost is always rendered through `<CostValue>` — Processing Units for every
 * viewer, raw USD appended for admins. Never format a dollar figure here.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  Coins,
  DollarSign,
  FileText,
  Gauge,
  Layers,
  Loader2,
  Snowflake,
  Tags,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CostValue } from "@/components/processing-units/CostValue";
import { useCostDisplay } from "@/components/processing-units/useCostDisplay";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { useTopicContext } from "../../context/ResearchContext";
import { useTopicCosts } from "../../hooks/useTopicCosts";
import {
  COST_PHASE_LABELS,
  type CostLedgerEntry,
  type CostPhase,
  type PhaseRollup,
} from "../../costs";
import type { NormalizedUsageModel } from "@/lib/token-usage/normalize";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const PHASE_ICON: Record<CostPhase, typeof Brain> = {
  page_analyses: Brain,
  keyword_syntheses: Layers,
  topic_syntheses: FileText,
  tag_consolidations: Tags,
  document_assembly: Zap,
};

function formatTokens(n: number): string {
  if (n < 1000) return n.toLocaleString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ── Stat tiles ──────────────────────────────────────────────────────────────

function StatTile({
  label,
  icon: Icon,
  children,
  accent,
  hint,
}: {
  label: string;
  icon: typeof Brain;
  children: React.ReactNode;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3">
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn("h-3 w-3 shrink-0", accent ?? "text-muted-foreground")}
        />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="text-lg font-bold mt-1 tabular-nums leading-none">
        {children}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-1 leading-none">
          {hint}
        </div>
      )}
    </div>
  );
}

const PHASE_COLUMNS: MatrxColumnDef<PhaseRollup>[] = [
  {
    id: "phase",
    header: "Phase",
    label: "Phase",
    accessorKey: "label",
    filter: "select",
    frozen: true,
    width: 220,
    cell: (phase) => {
      const Icon = PHASE_ICON[phase.phase];
      return (
        <div className="flex items-center gap-2">
          {phase.label !== "All phases · unfiltered" && (
            <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium">{phase.label}</span>
          {phase.failed_calls > 0 && (
            <span className="text-[10px] text-destructive/80">
              {phase.failed_calls} failed
              <ErrorAlchemyMenu />
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "calls",
    header: "Calls",
    filter: "number",
    align: "right",
    width: 84,
    cell: (phase) => <span className="tabular-nums">{phase.calls}</span>,
  },
  {
    accessorKey: "input_tokens",
    header: "In",
    label: "Input tokens",
    filter: "number",
    align: "right",
    width: 108,
    cell: (phase) => (
      <span className="tabular-nums">
        {phase.input_tokens.toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "cached_input_tokens",
    header: "Cached",
    label: "Cached input tokens",
    filter: "number",
    align: "right",
    width: 120,
    cell: (phase) => (
      <span className="tabular-nums text-muted-foreground">
        {phase.cached_input_tokens > 0
          ? phase.cached_input_tokens.toLocaleString()
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "output_tokens",
    header: "Out",
    label: "Output tokens",
    filter: "number",
    align: "right",
    width: 108,
    cell: (phase) => (
      <span className="tabular-nums">
        {phase.output_tokens.toLocaleString()}
      </span>
    ),
  },
  {
    id: "cost",
    header: "Cost",
    accessorFn: (phase) => phase.estimated_cost_usd,
    filter: "number",
    align: "right",
    width: 112,
    cell: (phase) => (
      <CostValue
        costUsd={phase.estimated_cost_usd}
        short
        muted={phase.calls === 0}
      />
    ),
  },
];

const MODEL_COLUMNS: MatrxColumnDef<NormalizedUsageModel>[] = [
  {
    accessorKey: "model",
    header: "Model",
    filter: "text",
    frozen: true,
    width: 240,
    cell: (model) => <span className="font-medium">{model.model}</span>,
  },
  {
    accessorKey: "api",
    header: "Provider",
    filter: "text",
    width: 140,
    cell: (model) => (
      <span className="text-muted-foreground">{model.api ?? "—"}</span>
    ),
  },
  {
    accessorKey: "requests",
    header: "Requests",
    filter: "number",
    align: "right",
    width: 100,
    cell: (model) => (
      <span className="tabular-nums">{model.requests.toLocaleString()}</span>
    ),
  },
  {
    accessorKey: "inputTokens",
    header: "In",
    label: "Input tokens",
    filter: "number",
    align: "right",
    width: 108,
    cell: (model) => (
      <span className="tabular-nums">{model.inputTokens.toLocaleString()}</span>
    ),
  },
  {
    accessorKey: "cachedInputTokens",
    header: "Cached",
    label: "Cached input tokens",
    filter: "number",
    align: "right",
    width: 120,
    cell: (model) => (
      <span className="tabular-nums text-muted-foreground">
        {model.cachedInputTokens > 0
          ? model.cachedInputTokens.toLocaleString()
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "outputTokens",
    header: "Out",
    label: "Output tokens",
    filter: "number",
    align: "right",
    width: 108,
    cell: (model) => (
      <span className="tabular-nums">
        {model.outputTokens.toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "costUsd",
    header: "Cost",
    filter: "number",
    align: "right",
    width: 112,
    cell: (model) => <CostValue costUsd={model.costUsd} short />,
  },
];

const LEDGER_COLUMNS: MatrxColumnDef<CostLedgerEntry>[] = [
  {
    id: "created-at",
    header: "When",
    label: "When",
    accessorFn: (entry) => entry.createdAt ?? "",
    filter: "date",
    frozen: true,
    width: 144,
    cell: (entry) => (
      <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
        {formatTime(entry.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "phaseLabel",
    header: "Phase",
    filter: "select",
    filterOptions: Object.entries(COST_PHASE_LABELS).map(([value, label]) => ({
      value: label,
      label,
    })),
    width: 180,
    cell: (entry) => {
      const Icon = PHASE_ICON[entry.phase];
      return (
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span>{entry.phaseLabel}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "subject",
    header: "Subject",
    filter: "text",
    width: 300,
    cell: (entry) => (
      <span className="block truncate" title={entry.subject}>
        {entry.subject}
      </span>
    ),
  },
  {
    accessorKey: "agentType",
    header: "Agent type",
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (entry) => (
      <span className="block truncate" title={entry.agentType ?? undefined}>
        {entry.agentType ?? "—"}
      </span>
    ),
  },
  {
    id: "models",
    header: "Model",
    accessorFn: (entry) => entry.models.join(" "),
    filter: "text",
    width: 180,
    mobileHidden: true,
    cell: (entry) => (
      <span className="block truncate" title={entry.models.join(", ")}>
        {entry.models.length > 0 ? entry.models.join(", ") : "—"}
      </span>
    ),
  },
  {
    id: "providers",
    header: "Provider",
    accessorFn: (entry) => entry.providers.join(" "),
    filter: "text",
    width: 150,
    mobileHidden: true,
    cell: (entry) => (
      <span className="block truncate" title={entry.providers.join(", ")}>
        {entry.providers.length > 0 ? entry.providers.join(", ") : "—"}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (entry) => (entry.succeeded ? "success" : "failed"),
    sortValue: (entry) => entry.status,
    filter: "select",
    filterOptions: [
      { value: "success", label: "Successful" },
      { value: "failed", label: "Failed" },
    ],
    align: "center",
    width: 96,
    cell: (entry) =>
      entry.succeeded ? (
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
          ok
        </span>
      ) : (
        <span className="text-[10px] text-destructive">{entry.status}</span>
      ),
  },
  {
    accessorKey: "inputTokens",
    header: "In",
    label: "Input tokens",
    filter: "number",
    align: "right",
    width: 92,
    cell: (entry) => (
      <span className="tabular-nums">{entry.inputTokens.toLocaleString()}</span>
    ),
  },
  {
    accessorKey: "cachedInputTokens",
    header: "Cached",
    label: "Cached input tokens",
    filter: "number",
    align: "right",
    width: 112,
    mobileHidden: true,
    cell: (entry) => (
      <span className="tabular-nums text-muted-foreground">
        {entry.cachedInputTokens > 0
          ? entry.cachedInputTokens.toLocaleString()
          : "—"}
      </span>
    ),
  },
  {
    accessorKey: "outputTokens",
    header: "Out",
    label: "Output tokens",
    filter: "number",
    align: "right",
    width: 92,
    cell: (entry) => (
      <span className="tabular-nums">
        {entry.outputTokens.toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "totalTokens",
    header: "Total",
    label: "Total tokens",
    filter: "number",
    align: "right",
    width: 104,
    mobileHidden: true,
    cell: (entry) => (
      <span className="tabular-nums text-muted-foreground">
        {entry.totalTokens.toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "costUsd",
    header: "Cost",
    filter: "number",
    align: "right",
    width: 112,
    cell: (entry) => (
      <CostValue
        costUsd={entry.costUsd}
        short
        stacked
        muted={!entry.succeeded}
      />
    ),
  },
];

// ── Page ────────────────────────────────────────────────────────────────────

export default function CostDashboard() {
  const [showFailed, setShowFailed] = useState(true);
  const { topicId } = useTopicContext();
  const { ledger, isLoading, error } = useTopicCosts(topicId);
  const { showUsd, units: unitsLabel } = useCostDisplay();

  if (isLoading && !ledger) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading costs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 p-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <DollarSign className="h-6 w-6 text-destructive/60" />
        </div>
        <div>
          <p className="text-xs font-medium text-foreground/70">
            Couldn&apos;t load costs
            <ErrorAlchemyMenu />
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 max-w-[280px]">
            {error}
            <ErrorAlchemyMenu error={error} />
          </p>
        </div>
      </div>
    );
  }

  if (!ledger || ledger.entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 p-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
          <DollarSign className="h-6 w-6 text-primary/40" />
        </div>
        <div>
          <p className="text-xs font-medium text-foreground/70">
            No AI activity yet
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 max-w-[280px]">
            Costs are tracked automatically as you run analysis, synthesis, and
            document generation.
          </p>
        </div>
      </div>
    );
  }

  const { totals, phases, models } = ledger;
  const visibleEntries = showFailed
    ? ledger.entries
    : ledger.entries.filter((entry) => entry.succeeded);
  const cacheRate =
    totals.inputTokens > 0
      ? (totals.cachedInputTokens / totals.inputTokens) * 100
      : 0;

  return (
    <div className="p-3 sm:p-4 space-y-3">
      {/* ── Headline ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <StatTile
          label="Processing Units"
          icon={Gauge}
          accent="text-amber-500"
          hint={showUsd ? "units · actual cost" : "what this topic consumed"}
        >
          <CostValue costUsd={totals.costUsd} stacked className="items-start" />
        </StatTile>
        <StatTile
          label="AI Calls"
          icon={Zap}
          accent="text-primary"
          hint={
            totals.failedCalls > 0
              ? `${totals.failedCalls} failed · ${unitsLabel(totals.failedCostUsd)} wasted`
              : undefined
          }
        >
          {totals.calls.toLocaleString()}
        </StatTile>
        <StatTile label="Input Tokens" icon={Coins} accent="text-sky-500">
          {formatTokens(totals.inputTokens)}
        </StatTile>
        <StatTile
          label="Cached Input"
          icon={Snowflake}
          accent="text-cyan-500"
          hint={cacheRate > 0 ? `${cacheRate.toFixed(1)}% of input` : undefined}
        >
          {formatTokens(totals.cachedInputTokens)}
        </StatTile>
        <StatTile
          label="Output Tokens"
          icon={FileText}
          accent="text-violet-500"
        >
          {formatTokens(totals.outputTokens)}
        </StatTile>
      </div>

      {!totals.costIsComplete && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            {totals.unpricedCalls} call{totals.unpricedCalls === 1 ? "" : "s"}{" "}
            could not be priced — the model is missing from the pricing catalog.
            The totals above understate the real cost.
          </p>
        </div>
      )}

      <section>
        <MatrxDataTable<PhaseRollup>
          tableId="research/topic-costs/by-phase"
          data={phases}
          columns={PHASE_COLUMNS}
          getRowId={(phase) => phase.phase}
          density="condensed"
          pageSize={0}
          hidePagination
          viewTabs={false}
          copy={false}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          toolbar={{ title: "By pipeline phase", search: false }}
          coverage={{
            noun: "pipeline phase",
            loaded: phases.length,
            total: phases.length,
            answeredBy: "client",
          }}
          footerRows={[
            {
              phase: "page_analyses",
              label: "All phases · unfiltered",
              calls: totals.calls,
              input_tokens: totals.inputTokens,
              cached_input_tokens: totals.cachedInputTokens,
              output_tokens: totals.outputTokens,
              estimated_cost_usd: totals.costUsd,
              failed_calls: totals.failedCalls,
              cost_is_complete: totals.costIsComplete,
            },
          ]}
          rowClassName={(phase) =>
            phase.calls === 0 ? "opacity-50" : undefined
          }
          emptyState={{
            title: "No pipeline phases",
            description: "Costs will appear here as this topic runs.",
          }}
        />
      </section>

      {/* ── By model ───────────────────────────────────────────────────── */}
      {models.length > 0 && (
        <MatrxDataTable<NormalizedUsageModel>
          tableId="research/topic-costs/by-model"
          data={models}
          columns={MODEL_COLUMNS}
          getRowId={(model) => model.model}
          density="condensed"
          pageSize={0}
          hidePagination
          viewTabs={false}
          copy={false}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          toolbar={{ title: "By model", search: false }}
          coverage={{
            noun: "model",
            loaded: models.length,
            total: models.length,
            answeredBy: "client",
          }}
        />
      )}

      {/* ── Every call ─────────────────────────────────────────────────── */}
      <MatrxDataTable<CostLedgerEntry>
        tableId="research/topic-costs/every-call"
        data={visibleEntries}
        columns={LEDGER_COLUMNS}
        getRowId={(entry) => entry.id}
        density="condensed"
        pageSize={0}
        hidePagination
        viewTabs={false}
        copy={false}
        detail={{ enabled: false }}
        window={{ enabled: false }}
        toolbar={{
          title: "Every AI call",
          searchPlaceholder: "Search subjects, phases, models, or providers…",
          facets: [
            {
              type: "custom",
              id: "show-failed",
              render: () => (
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showFailed}
                    onChange={(event) => setShowFailed(event.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Show failed
                </label>
              ),
              filter: {
                active: !showFailed,
                onReset: () => setShowFailed(true),
              },
            },
          ],
        }}
        coverage={{
          noun: "AI call",
          loaded: ledger.entries.length,
          total: ledger.entries.length,
          answeredBy: "client",
        }}
        rowClassName={(entry) =>
          entry.succeeded ? undefined : "bg-destructive/5"
        }
        emptyState={{
          title: "No calls match the current filters",
          description: "Clear a filter or run another AI task for this topic.",
        }}
      />
    </div>
  );
}
