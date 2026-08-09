"use client";

/**
 * The topic cost surface: what the run consumed, phase by phase, model by
 * model, and call by call.
 *
 * Cost is always rendered through `<CostValue>` — Processing Units for every
 * viewer, raw USD appended for admins. Never format a dollar figure here.
 */

import { useMemo, useState } from "react";
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
import { useTopicContext } from "../../context/ResearchContext";
import { useTopicCosts } from "../../hooks/useTopicCosts";
import {
  COST_PHASE_LABELS,
  type CostLedgerEntry,
  type CostPhase,
} from "../../costs";
import {
  MOBILE_TABLE,
  MOBILE_TABLE_FROZEN_CELL,
  MOBILE_TABLE_FROZEN_HEAD,
} from "@/components/official/mobile-table/mobileTable";

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

// ── Ledger row ──────────────────────────────────────────────────────────────

function LedgerRow({ entry }: { entry: CostLedgerEntry }) {
  const Icon = PHASE_ICON[entry.phase];
  return (
    <tr
      className={cn(
        "border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors",
        !entry.succeeded && "bg-destructive/5",
      )}
    >
      <td className={cn("px-2 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums text-[11px]", MOBILE_TABLE_FROZEN_CELL, "max-sm:min-w-0")}>
        {formatTime(entry.createdAt)}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="truncate">{entry.phaseLabel}</span>
        </div>
      </td>
      <td className="px-2 py-1.5">
        <span className="block truncate" title={entry.subject}>
          {entry.subject}
        </span>
        {entry.agentType && (
          <span className="block truncate text-[10px] text-muted-foreground/70">
            {entry.agentType}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 hidden md:table-cell">
        <span className="block truncate" title={entry.models.join(", ")}>
          {entry.models.length > 0 ? entry.models.join(", ") : "—"}
        </span>
        {entry.providers.length > 0 && (
          <span className="block text-[10px] text-muted-foreground/70">
            {entry.providers.join(", ")}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-center">
        {entry.succeeded ? (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
            ok
          </span>
        ) : (
          <span className="text-[10px] text-destructive">{entry.status}</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {entry.inputTokens.toLocaleString()}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
        {entry.cachedInputTokens > 0
          ? entry.cachedInputTokens.toLocaleString()
          : "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {entry.outputTokens.toLocaleString()}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
        {entry.totalTokens.toLocaleString()}
      </td>
      <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
        <CostValue
          costUsd={entry.costUsd}
          short
          stacked
          muted={!entry.succeeded}
        />
      </td>
    </tr>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function CostDashboard() {
  const { topicId } = useTopicContext();
  const { ledger, isLoading, error } = useTopicCosts(topicId);
  const { showUsd, units: unitsLabel } = useCostDisplay();
  const [phaseFilter, setPhaseFilter] = useState<CostPhase | "all">("all");
  const [showFailed, setShowFailed] = useState(true);

  const visibleEntries = useMemo(() => {
    if (!ledger) return [];
    return ledger.entries.filter((e) => {
      if (phaseFilter !== "all" && e.phase !== phaseFilter) return false;
      if (!showFailed && !e.succeeded) return false;
      return true;
    });
  }, [ledger, phaseFilter, showFailed]);

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
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 max-w-[280px]">
            {error}
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

      {/* ── By phase ───────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
        <header className="px-3 py-2 border-b border-border/50 bg-muted/30">
          <h2 className="text-xs font-semibold">By pipeline phase</h2>
        </header>
        <div className="overflow-x-auto">
          <table className={cn("text-xs", MOBILE_TABLE)}>
            <thead>
              <tr className="border-b border-border/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className={cn("px-3 py-2 text-left font-medium", MOBILE_TABLE_FROZEN_HEAD, "max-sm:bg-card")}>Phase</th>
                <th className="px-3 py-2 text-right font-medium">Calls</th>
                <th className="px-3 py-2 text-right font-medium">In</th>
                <th className="px-3 py-2 text-right font-medium">Cached</th>
                <th className="px-3 py-2 text-right font-medium">Out</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((phase) => {
                const Icon = PHASE_ICON[phase.phase];
                const empty = phase.calls === 0;
                return (
                  <tr
                    key={phase.phase}
                    className={cn(
                      "border-b border-border/30 last:border-0",
                      empty && "opacity-50",
                    )}
                  >
                    <td className={cn("px-3 py-1.5 font-medium", MOBILE_TABLE_FROZEN_CELL)}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span>{phase.label}</span>
                        {phase.failed_calls > 0 && (
                          <span className="text-[10px] text-destructive/80">
                            {phase.failed_calls} failed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {phase.calls}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {phase.input_tokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {phase.cached_input_tokens > 0
                        ? phase.cached_input_tokens.toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {phase.output_tokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      <CostValue
                        costUsd={phase.estimated_cost_usd}
                        short
                        muted={empty}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 font-semibold">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {totals.calls}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {totals.inputTokens.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {totals.cachedInputTokens.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {totals.outputTokens.toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <CostValue costUsd={totals.costUsd} short />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── By model ───────────────────────────────────────────────────── */}
      {models.length > 0 && (
        <section className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
          <header className="px-3 py-2 border-b border-border/50 bg-muted/30">
            <h2 className="text-xs font-semibold">By model</h2>
          </header>
          <div className="overflow-x-auto">
            <table className={cn("text-xs", MOBILE_TABLE)}>
              <thead>
                <tr className="border-b border-border/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className={cn("px-3 py-2 text-left font-medium", MOBILE_TABLE_FROZEN_HEAD, "max-sm:bg-card")}>Model</th>
                  <th className="px-3 py-2 text-left font-medium">Provider</th>
                  <th className="px-3 py-2 text-right font-medium">Requests</th>
                  <th className="px-3 py-2 text-right font-medium">In</th>
                  <th className="px-3 py-2 text-right font-medium">Cached</th>
                  <th className="px-3 py-2 text-right font-medium">Out</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr
                    key={m.model}
                    className="border-b border-border/30 last:border-0"
                  >
                    <td className={cn("px-3 py-1.5 font-medium", MOBILE_TABLE_FROZEN_CELL)}>
                      {m.model}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {m.api ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {m.requests.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {m.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {m.cachedInputTokens > 0
                        ? m.cachedInputTokens.toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {m.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      <CostValue costUsd={m.costUsd} short />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Every call ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30">
          <h2 className="text-xs font-semibold">Every AI call</h2>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {visibleEntries.length} of {ledger.entries.length}
          </span>
          <div className="flex-1" />
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={showFailed}
              onChange={(e) => setShowFailed(e.target.checked)}
              className="h-3 w-3 accent-primary"
            />
            Show failed
          </label>
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value as CostPhase | "all")}
            className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px]"
          >
            <option value="all">All phases</option>
            {phases.map((p) => (
              <option key={p.phase} value={p.phase}>
                {COST_PHASE_LABELS[p.phase]}
              </option>
            ))}
          </select>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[860px] table-fixed">
            <colgroup>
              <col className="w-[128px]" />
              <col className="w-[140px]" />
              <col />
              <col className="w-[128px] hidden md:table-column" />
              <col className="w-[56px]" />
              <col className="w-[68px]" />
              <col className="w-[68px] hidden lg:table-column" />
              <col className="w-[68px]" />
              <col className="w-[72px] hidden sm:table-column" />
              <col className="w-[96px]" />
            </colgroup>
            <thead className="bg-muted/60">
              <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className={cn("px-2 py-2 text-left font-medium", MOBILE_TABLE_FROZEN_HEAD, "max-sm:min-w-0 max-sm:bg-muted/60")}>When</th>
                <th className="px-2 py-2 text-left font-medium">Phase</th>
                <th className="px-2 py-2 text-left font-medium">Subject</th>
                <th className="px-2 py-2 text-left font-medium hidden md:table-cell">
                  Model
                </th>
                <th className="px-2 py-2 text-center font-medium">Status</th>
                <th className="px-2 py-2 text-right font-medium">In</th>
                <th className="px-2 py-2 text-right font-medium hidden lg:table-cell">
                  Cached
                </th>
                <th className="px-2 py-2 text-right font-medium">Out</th>
                <th className="px-2 py-2 text-right font-medium hidden sm:table-cell">
                  Total
                </th>
                <th className="px-2 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
        {visibleEntries.length === 0 && (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
            No calls match the current filter.
          </p>
        )}
      </section>
    </div>
  );
}
