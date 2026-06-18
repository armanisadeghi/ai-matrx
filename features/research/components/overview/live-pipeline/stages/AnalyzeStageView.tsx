"use client";

import { useEffect, useState } from "react";
import { Brain, Star } from "lucide-react";
import type {
  PipelineState,
  PipelineDerived,
  WorkItem,
} from "../../../../hooks/usePipelineProgress";
import { SectionCard } from "../ui/SectionCard";
import { StageHeader } from "../ui/StageHeader";
import { WorkItemCard } from "../ui/WorkItemCard";
import { ModelBadge } from "../ui/ModelBadge";
import { AgentBadge } from "../ui/AgentBadge";
import { Sparkline } from "../ui/Sparkline";
import { FoldableSection } from "../ui/FoldableSection";

interface Props {
  state: PipelineState;
  derived: PipelineDerived;
  ratePerSec: number;
  etaSeconds: number | null;
}

const MAX_LEGEND = 6;

function LegendStrip({
  label,
  values,
  badgeFn,
}: {
  label: string;
  values: string[];
  badgeFn: (v: string) => React.ReactNode;
}) {
  if (values.length === 0) return null;
  const visible = values.slice(0, MAX_LEGEND);
  const overflow = values.length - visible.length;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      {visible.map((v) => (
        <span key={v}>{badgeFn(v)}</span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

function AnalyzeCard({ item }: { item: WorkItem }) {
  const badges: React.ReactNode[] = [];
  if (item.metadata.agent_type) {
    badges.push(
      <AgentBadge key="agent" agentType={item.metadata.agent_type} />,
    );
  }
  if (item.metadata.model_id) {
    badges.push(<ModelBadge key="model" modelId={item.metadata.model_id} />);
  }
  const meta = item.metadata.result_length
    ? `${(item.metadata.result_length / 1024).toFixed(1)} KB`
    : null;

  return (
    <WorkItemCard
      status={item.status}
      label={item.label}
      hostname={item.hostname}
      badges={badges.length > 0 ? <>{badges}</> : null}
      meta={meta}
    />
  );
}

export function AnalyzeStageView({
  state,
  derived,
  ratePerSec,
  etaSeconds,
}: Props) {
  const stage = state.stages.analyze;
  const items = stage.itemOrder.map((id) => stage.items[id]);
  const active = items.filter((i) => i.status === "active");
  const completed = items
    .filter((i) => i.status !== "active")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const [completedOpen, setCompletedOpen] = useState(active.length === 0);

  useEffect(() => {
    if (active.length > 0) {
      setCompletedOpen(false);
    }
  }, [active.length]);

  return (
    <SectionCard
      title={
        <>
          <Brain className="h-3 w-3 text-purple-500" />
          <span>Analyzing content</span>
        </>
      }
      trailing={
        derived.rate > 0.1 && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Sparkline
              timestamps={stage.recentCompletions}
              className="text-purple-500"
            />
            <span className="tabular-nums">{derived.rate.toFixed(1)}/s</span>
          </div>
        )
      }
    >
      <StageHeader
        title="Multi-agent analysis"
        icon={<Brain className="h-3 w-3" />}
        stage={stage}
        subtitle={
          <span>
            {derived.uniqueAgents.length} agent type
            {derived.uniqueAgents.length === 1 ? "" : "s"} •{" "}
            {derived.uniqueModels.length} model
            {derived.uniqueModels.length === 1 ? "" : "s"} orchestrated
          </span>
        }
        ratePerSec={ratePerSec}
        etaSeconds={etaSeconds}
      />

      {/* 8-for-1 dedup callout */}
      {derived.dedupLabel && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5">
          <Star className="h-3 w-3 text-emerald-500 shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
            <span className="font-semibold">8-for-1 dedup:</span>{" "}
            {derived.dedupLabel}
          </span>
        </div>
      )}

      {/* Legends */}
      {(derived.uniqueAgents.length > 0 || derived.uniqueModels.length > 0) && (
        <div className="mt-2 space-y-1.5">
          <LegendStrip
            label="Agents"
            values={derived.uniqueAgents}
            badgeFn={(v) => <AgentBadge agentType={v} />}
          />
          <LegendStrip
            label="Models"
            values={derived.uniqueModels}
            badgeFn={(v) => <ModelBadge modelId={v} />}
          />
        </div>
      )}

      {/* In-flight grid */}
      {active.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            In flight ({active.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {active.slice(0, 8).map((item) => (
              <AnalyzeCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Recently completed */}
      {completed.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <FoldableSection
            open={completedOpen}
            onOpenChange={setCompletedOpen}
            summary={
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recently completed ({completed.length})
              </span>
            }
            contentClassName="pt-1.5"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto">
              {completed.slice(0, 24).map((item) => (
                <AnalyzeCard key={item.id} item={item} />
              ))}
            </div>
          </FoldableSection>
        </div>
      )}
    </SectionCard>
  );
}
