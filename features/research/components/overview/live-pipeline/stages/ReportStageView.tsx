"use client";

import Link from "next/link";
import { FileText, Tags, ArrowRight, CircleDot } from "lucide-react";
import type {
  PipelineState,
  WorkItem,
} from "../../../../hooks/usePipelineProgress";
import { SectionCard } from "../ui/SectionCard";
import { StageHeader } from "../ui/StageHeader";
import { StatusDot } from "../ui/StatusDot";
import { cn } from "@/lib/utils";

interface Props {
  state: PipelineState;
  topicId: string;
  ratePerSec: number;
  etaSeconds: number | null;
}

function ReportItem({ item }: { item: WorkItem }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
        item.status === "success"
          ? "border-green-500/30 bg-green-500/5"
          : item.status === "failed"
            ? "border-destructive/30 bg-destructive/5"
            : "border-border/60 bg-card/40",
      )}
    >
      <StatusDot status={item.status} />
      {item.id.startsWith("tag:") ? (
        <Tags className="h-3 w-3 text-foreground/60" />
      ) : (
        <FileText className="h-3 w-3 text-primary" />
      )}
      <span className="type-secondary font-medium truncate">{item.label}</span>
    </div>
  );
}

export function ReportStageView({
  state,
  topicId,
  ratePerSec,
  etaSeconds,
}: Props) {
  const stage = state.stages.report;
  const items = stage.itemOrder.map((id) => stage.items[id]);
  const tagItems = items.filter((i) => i.id.startsWith("tag:"));
  const docItem = items.find((i) => i.id === "document");

  return (
    <SectionCard
      title={
        <>
          <CircleDot className="h-3 w-3 text-amber-500" />
          <span>Report assembly</span>
        </>
      }
    >
      <StageHeader
        title="Tag consolidation & document"
        icon={<FileText className="h-3 w-3" />}
        stage={stage}
        ratePerSec={ratePerSec}
        etaSeconds={etaSeconds}
      />

      {tagItems.length > 0 && (
        <div className="mt-3">
          <div className="type-meta uppercase tracking-wider text-muted-foreground mb-1">
            Tag consolidations ({tagItems.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {tagItems.map((item) => (
              <ReportItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {docItem && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={docItem.status} size="md" />
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="type-title truncate">
                Document generated
              </div>
              <div className="type-meta text-muted-foreground">
                Final assembled research output
              </div>
            </div>
          </div>
          {docItem.status === "success" && (
            <Link
              href={`/research/topics/${topicId}/document`}
              className="inline-flex items-center gap-1 type-secondary font-medium text-primary hover:underline shrink-0"
            >
              View
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </SectionCard>
  );
}
