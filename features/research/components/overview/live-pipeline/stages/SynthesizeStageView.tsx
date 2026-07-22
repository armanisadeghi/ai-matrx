"use client";

import { Layers, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PipelineState,
  WorkItem,
} from "../../../../hooks/usePipelineProgress";
import { SectionCard } from "../ui/SectionCard";
import { StageHeader } from "../ui/StageHeader";
import { StatusDot, STATUS_TEXT_CLASS, STATUS_LABELS } from "../ui/StatusDot";
import { ModelBadge } from "../ui/ModelBadge";
import { StreamingTextPanel } from "../ui/StreamingTextPanel";

interface Props {
  state: PipelineState;
  ratePerSec: number;
  etaSeconds: number | null;
  /** Live LLM output, accumulated by useResearchStream's chunk handler. */
  streamingText: string;
  /** Whether the stream is still active. */
  isStreaming: boolean;
}

function SynthCard({ item }: { item: WorkItem }) {
  const isTopic = item.metadata.scope === "topic";
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 transition-colors",
        item.status === "active" && "border-primary/40 bg-primary/5",
        item.status === "success" && "border-green-500/30 bg-green-500/5",
        item.status === "failed" && "border-destructive/30 bg-destructive/5",
        item.status !== "active" &&
          item.status !== "success" &&
          item.status !== "failed" &&
          "border-border/60 bg-card/40",
        isTopic && "ring-1 ring-primary/20",
      )}
    >
      <div className="flex items-center gap-2">
        <StatusDot status={item.status} size="md" />
        {isTopic ? (
          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
        ) : (
          <Layers className="h-3 w-3 text-foreground/60 shrink-0" />
        )}
        <span className="text-xs font-medium truncate">{item.label}</span>
        <span
          className={cn(
            "text-[10px] capitalize ml-auto shrink-0",
            STATUS_TEXT_CLASS[item.status],
          )}
        >
          {STATUS_LABELS[item.status]}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
        {item.metadata.model_id && (
          <ModelBadge modelId={item.metadata.model_id} />
        )}
        {item.metadata.result_length != null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {(item.metadata.result_length / 1024).toFixed(1)} KB
          </span>
        )}
        {item.metadata.version != null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            v{item.metadata.version}
          </span>
        )}
        {item.metadata.error && (
          <span className="text-[10px] text-destructive truncate max-w-[200px]">
            {item.metadata.error}
          </span>
        )}
      </div>
    </div>
  );
}

export function SynthesizeStageView({
  state,
  ratePerSec,
  etaSeconds,
  streamingText,
  isStreaming,
}: Props) {
  const stage = state.stages.synthesize;
  const items = stage.itemOrder.map((id) => stage.items[id]);
  const keywordItems = items.filter((i) => i.metadata.scope === "keyword");
  const topicItems = items.filter((i) => i.metadata.scope === "topic");

  // Best guess at the "active model" for the streaming-text footer.
  const activeTopic = topicItems.find((i) => i.status === "active");
  const activeKeyword = keywordItems.find((i) => i.status === "active");
  const activeItem = activeTopic ?? activeKeyword;
  const activeModelId = activeItem?.metadata.model_id ?? null;

  return (
    <SectionCard
      title={
        <>
          <Layers className="h-3 w-3 text-cyan-500" />
          <span>Synthesizing report</span>
        </>
      }
    >
      <StageHeader
        title="Synthesis"
        icon={<Layers className="h-3 w-3" />}
        stage={stage}
        subtitle={
          <span>
            {keywordItems.length} keyword{keywordItems.length === 1 ? "" : "s"}
            {topicItems.length > 0 && ` • topic report ${topicItems.find((i) => i.status === "success") ? "ready" : "in flight"}`}
          </span>
        }
        ratePerSec={ratePerSec}
        etaSeconds={etaSeconds}
      />

      {keywordItems.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Per-keyword syntheses
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {keywordItems.map((item) => (
              <SynthCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {topicItems.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Topic synthesis
          </div>
          {topicItems.map((item) => (
            <SynthCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* The wow moment: live LLM output streaming in */}
      {(streamingText.length > 0 || (isStreaming && activeItem)) && (
        <div className="mt-3">
          <StreamingTextPanel
            text={streamingText}
            isStreaming={isStreaming && activeItem?.status === "active"}
            modelId={activeModelId}
            title={
              activeTopic
                ? "Generating topic report"
                : "Generating synthesis"
            }
          />
        </div>
      )}
    </SectionCard>
  );
}
