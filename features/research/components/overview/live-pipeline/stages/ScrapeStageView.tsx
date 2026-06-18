"use client";

import { useEffect, useState } from "react";
import { Download, MoreVertical, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useResearchApi } from "../../../../hooks/useResearchApi";
import type {
  PipelineState,
  WorkItem,
} from "../../../../hooks/usePipelineProgress";
import { SectionCard } from "../ui/SectionCard";
import { StageHeader } from "../ui/StageHeader";
import { WorkItemCard } from "../ui/WorkItemCard";
import { CaptureLevelChip } from "../ui/CaptureLevelChip";
import { FoldableSection } from "../ui/FoldableSection";

function formatBytes(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`;
  return `${(chars / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  state: PipelineState;
  topicId: string;
  ratePerSec: number;
  etaSeconds: number | null;
  onSourceUpdated?: () => void;
}

function VerdictMenu({
  topicId,
  sourceId,
  url,
  onDone,
}: {
  topicId: string;
  sourceId: string;
  url?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const api = useResearchApi();

  const submit = async (
    verdict: "accept_as_is" | "dead_link" | "gated" | "retry",
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.applyVerdict(topicId, sourceId, { verdict });
      const message: Record<typeof verdict, string> = {
        accept_as_is: "Marked as complete",
        dead_link: "Marked as dead link",
        gated: "Marked as gated",
        retry: "Re-queued for retry",
      };
      toast.success(message[verdict]);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verdict failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "h-5 w-5 rounded-full inline-flex items-center justify-center",
            "text-muted-foreground/70 hover:text-foreground hover:bg-muted",
            busy && "opacity-50 pointer-events-none",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {url && (
          <>
            <DropdownMenuItem asChild>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs"
              >
                <ExternalLink className="h-3 w-3" />
                Open URL
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={() => submit("accept_as_is")}
          className="text-xs"
        >
          Accept as-is (page is sparse)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => submit("retry")} className="text-xs">
          Re-queue retry
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => submit("gated")}
          className="text-xs text-orange-600 dark:text-orange-400"
        >
          Mark as gated
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => submit("dead_link")}
          className="text-xs text-red-600 dark:text-red-400"
        >
          Mark as dead link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScrapeCard({
  item,
  topicId,
  onUpdated,
}: {
  item: WorkItem;
  topicId: string;
  onUpdated?: () => void;
}) {
  const meta: React.ReactNode = item.metadata.char_count
    ? formatBytes(item.metadata.char_count)
    : null;

  const badges: React.ReactNode[] = [];
  if (item.metadata.capture_level) {
    badges.push(
      <CaptureLevelChip key="cap" level={item.metadata.capture_level} />,
    );
  }
  if (item.metadata.last_failure_reason) {
    badges.push(
      <span
        key="fail"
        className="text-[9px] text-red-600/80 dark:text-red-400/80 truncate max-w-[140px]"
        title={item.metadata.last_failure_reason}
      >
        {item.metadata.last_failure_reason}
      </span>,
    );
  }

  const showVerdict =
    item.status === "failed" ||
    item.status === "partial" ||
    item.metadata.is_good_scrape === false;

  return (
    <WorkItemCard
      status={item.status}
      label={item.label}
      hostname={item.hostname}
      meta={meta}
      badges={badges.length > 0 ? <>{badges}</> : null}
      trailing={
        showVerdict ? (
          <VerdictMenu
            topicId={topicId}
            sourceId={item.id}
            url={item.url}
            onDone={onUpdated}
          />
        ) : null
      }
    />
  );
}

export function ScrapeStageView({
  state,
  topicId,
  ratePerSec,
  etaSeconds,
  onSourceUpdated,
}: Props) {
  const stage = state.stages.scrape;
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

  const counts = {
    success: 0,
    partial: 0,
    failed: 0,
    dead_link: 0,
    gated: 0,
  };
  for (const item of items) {
    if (item.status in counts) {
      counts[item.status as keyof typeof counts]++;
    }
  }

  const totalChars = items.reduce(
    (s, i) => s + (i.metadata.char_count ?? 0),
    0,
  );

  return (
    <SectionCard
      title={
        <>
          <Download className="h-3 w-3 text-emerald-500" />
          <span>Scraping content</span>
        </>
      }
    >
      <StageHeader
        title="Concurrent scraping"
        icon={<Download className="h-3 w-3" />}
        stage={stage}
        subtitle={
          <span className="tabular-nums">
            {counts.success} good • {counts.partial} thin •{" "}
            {counts.failed + counts.dead_link + counts.gated} can&apos;t fetch •{" "}
            {formatBytes(totalChars)} captured
          </span>
        }
        ratePerSec={ratePerSec}
        etaSeconds={etaSeconds}
      />

      {active.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            In flight ({active.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {active.slice(0, 8).map((item) => (
              <ScrapeCard
                key={item.id}
                item={item}
                topicId={topicId}
                onUpdated={onSourceUpdated}
              />
            ))}
          </div>
        </div>
      )}

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
                <ScrapeCard
                  key={item.id}
                  item={item}
                  topicId={topicId}
                  onUpdated={onSourceUpdated}
                />
              ))}
            </div>
          </FoldableSection>
        </div>
      )}
    </SectionCard>
  );
}
