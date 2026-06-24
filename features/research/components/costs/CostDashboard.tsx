"use client";

import {
  DollarSign,
  Loader2,
  Brain,
  Layers,
  FileText,
  Tags,
  Zap
} from "lucide-react";
import { useCostSummary } from "../../hooks/useCostSummary";
import { useTopicContext } from "../../context/ResearchContext";
import type { TopicCostSummary, CostBreakdownItem } from "../../types";
import { costToUnits, formatUnits } from "@/lib/processing-units/units";

const PHASE_LABELS: Array<{
  key: keyof Pick<
    TopicCostSummary,
    | "page_analyses"
    | "keyword_syntheses"
    | "project_syntheses"
    | "tag_consolidations"
    | "document_assembly"
  >;
  icon: typeof Brain;
}> = [
  { key: "page_analyses", icon: Brain },
  { key: "keyword_syntheses", icon: Layers },
  { key: "project_syntheses", icon: FileText },
  { key: "tag_consolidations", icon: Tags },
  { key: "document_assembly", icon: Zap },
];

// Users see Processing Units, never raw dollars (costToUnits = round(usd*2000);
// one platform-wide conversion in lib/processing-units).
function formatCost(usd: number): string {
  return formatUnits(costToUnits(usd));
}

function PhaseRow({
  label,
  icon: Icon,
  item,
}: {
  label: string;
  icon: typeof Brain;
  item: CostBreakdownItem;
}) {
  const greyed = item.calls === 0;
  return (
    <tr
      className={
        greyed
          ? "border-b border-border/40 last:border-0 opacity-50"
          : "border-b border-border/40 last:border-0"
      }
    >
      <td className="px-3 py-1.5 font-medium">
        <div className="flex items-center gap-2">
          <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
          <span>{label}</span>
        </div>
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{item.calls}</td>
      <td className="px-3 py-1.5 text-right tabular-nums hidden sm:table-cell">
        {item.input_tokens.toLocaleString()}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums hidden sm:table-cell">
        {item.output_tokens.toLocaleString()}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
        {formatCost(item.estimated_cost_usd)}
      </td>
    </tr>
  );
}

export default function CostDashboard() {
  const { topicId } = useTopicContext();
  const { data: costs, isLoading, error } = useCostSummary(topicId);

  if (isLoading) {
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

  // No LLM activity yet — show the empty state but keep it informative.
  if (!costs || costs.total_llm_calls === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 p-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
          <DollarSign className="h-6 w-6 text-primary/40" />
        </div>
        <div>
          <p className="text-xs font-medium text-foreground/70">
            No LLM activity yet
          </p>
          <p className="text-[10px] text-muted-foreground mt-1 max-w-[280px]">
            Costs are tracked automatically as you run analysis, synthesis, and
            document generation.
          </p>
        </div>
      </div>
    );
  }

  const totalInput = costs.total_input_tokens;
  const totalOutput = costs.total_output_tokens;
  const totalCost = costs.total_estimated_cost_usd;

  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
        <span className="text-xs font-medium text-foreground/80">Costs</span>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatCost(totalCost)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            Processing Units
          </div>
          <div className="text-lg font-bold mt-0.5 tabular-nums leading-none">
            {formatCost(totalCost)}
          </div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
            LLM Calls
          </div>
          <div className="text-lg font-bold mt-0.5 tabular-nums leading-none">
            {costs.total_llm_calls}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50">
              <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">
                Category
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground">
                Calls
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground hidden sm:table-cell">
                In Tokens
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground hidden sm:table-cell">
                Out Tokens
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground">
                Units
              </th>
            </tr>
          </thead>
          <tbody>
            {PHASE_LABELS.map(({ key, icon }) => (
              <PhaseRow
                key={key}
                label={costs[key].label}
                icon={icon}
                item={costs[key]}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/20 font-semibold">
              <td className="px-3 py-1.5">Total</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {costs.total_llm_calls}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums hidden sm:table-cell">
                {totalInput.toLocaleString()}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums hidden sm:table-cell">
                {totalOutput.toLocaleString()}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatCost(totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
