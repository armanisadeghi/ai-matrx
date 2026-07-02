"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  Play,
  Pause,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type {
  PipelineState,
  StageKind,
} from "../../../hooks/usePipelineProgress";

type FilterKey = "all" | "errors" | "info" | "current";

interface FeedEntry {
  id: string;
  timestamp: number;
  kind: "data" | "info" | "phase" | "error" | "warning" | "complete";
  level: "info" | "success" | "warning" | "error";
  stage: StageKind | null;
  primary: string;
  secondary?: string;
}

const STAGE_FROM_EVENT: Record<string, StageKind> = {
  search_page_start: "search",
  search_page_complete: "search",
  search_sources_stored: "search",
  search_complete: "search",
  scrape_start: "scrape",
  scrape_complete: "scrape",
  scrape_failed: "scrape",
  rescrape_complete: "scrape",
  analysis_start: "analyze",
  analysis_complete: "analyze",
  analysis_failed: "analyze",
  analyze_all_complete: "analyze",
  retry_complete: "analyze",
  retry_all_complete: "analyze",
  synthesis_start: "synthesize",
  synthesis_complete: "synthesize",
  synthesis_failed: "synthesize",
  consolidate_complete: "report",
  suggest_tags_complete: "report",
  document_complete: "report",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildEntries(
  rawEvents: TypedStreamEvent[],
  state: PipelineState,
): FeedEntry[] {
  const out: FeedEntry[] = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const evt = rawEvents[i];
    const baseId = `evt-${i}`;
    if (evt.event === "phase") {
      out.push({
        id: baseId,
        timestamp: Date.now(),
        kind: "phase",
        level: "info",
        stage: null,
        primary: `Phase: ${evt.data.phase}`,
      });
    } else if (evt.event === "data") {
      const data = evt.data as Record<string, unknown> & { type?: string };
      // Pydantic discriminator is `type`, not `event`.
      const subEvent = data.type;
      if (!subEvent || typeof subEvent !== "string") continue;
      const stage = STAGE_FROM_EVENT[subEvent] ?? null;
      const label = subEvent.replace(/_/g, " ");
      const isFailed = subEvent.includes("_failed");
      const isComplete = subEvent.includes("_complete") || subEvent.includes("_stored");

      let secondary: string | undefined;
      if ("keyword" in data && typeof data.keyword === "string") {
        secondary = data.keyword;
      } else if ("url" in data && typeof data.url === "string") {
        try {
          secondary = new URL(data.url).hostname.replace(/^www\./, "");
        } catch {
          secondary = data.url;
        }
      }
      const extras: string[] = [];
      if ("page" in data && typeof data.page === "number" && "total_pages" in data) {
        extras.push(`page ${data.page}/${data.total_pages}`);
      }
      if ("char_count" in data && typeof data.char_count === "number") {
        extras.push(`${(data.char_count / 1024).toFixed(1)}KB`);
      }
      if ("agent_type" in data && typeof data.agent_type === "string") {
        extras.push(String(data.agent_type));
      }
      if ("model_id" in data && data.model_id) {
        extras.push(String(data.model_id));
      }
      if (extras.length > 0) {
        secondary = secondary
          ? `${secondary} • ${extras.join(" • ")}`
          : extras.join(" • ");
      }
      out.push({
        id: baseId,
        timestamp: Date.now(),
        kind: isFailed ? "error" : "data",
        level: isFailed ? "error" : isComplete ? "success" : "info",
        stage,
        primary: label,
        secondary,
      });
    } else if (evt.event === "error") {
      const data = evt.data;
      out.push({
        id: baseId,
        timestamp: Date.now(),
        kind: "error",
        level: "error",
        stage: null,
        primary: data.user_message ?? data.message ?? "Error",
      });
    } else if (evt.event === "end") {
      out.push({
        id: baseId,
        timestamp: Date.now(),
        kind: "complete",
        level: "success",
        stage: null,
        primary: "Stream complete",
      });
    }
  }

  // Add infos (keyed off pipeline state — they have stable ids).
  for (const info of state.infos) {
    out.push({
      id: info.id,
      timestamp: info.timestamp,
      kind: "info",
      level: info.level === "warning" ? "warning" : "info",
      stage: null,
      primary: info.code,
      secondary: info.message,
    });
  }

  // Cap at 500 (FIFO), render most recent at top.
  return out.slice(-500).reverse();
}

interface Props {
  rawEvents: TypedStreamEvent[];
  state: PipelineState;
  className?: string;
}

export function ActivityFeed({ rawEvents, state, className }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [autoscroll, setAutoscroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(
    () => buildEntries(rawEvents, state),
    [rawEvents, state],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "errors":
        return entries.filter((e) => e.level === "error" || e.level === "warning");
      case "info":
        return entries.filter((e) => e.kind === "info");
      case "current":
        return entries.filter(
          (e) => e.stage != null && e.stage === state.activeStage,
        );
      default:
        return entries;
    }
  }, [entries, filter, state.activeStage]);

  useEffect(() => {
    if (!autoscroll) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filtered, autoscroll]);

  const visible = filtered.slice(0, 100);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden flex flex-col",
        // Fill the available vertical space instead of a fixed ~288px box.
        // When sticky (desktop) the card spans the viewport and the feed body
        // scrolls inside it; on mobile it falls back to a sane bounded height.
        "lg:h-[calc(100dvh-8rem)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-1">
          {(["all", "errors", "info", "current"] as FilterKey[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded",
                filter === f
                  ? "bg-foreground text-background font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "current" ? "stage" : f}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAutoscroll((a) => !a)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          title={autoscroll ? "Pause autoscroll" : "Resume autoscroll"}
        >
          {autoscroll ? (
            <>
              <Pause className="h-2.5 w-2.5" /> live
            </>
          ) : (
            <>
              <Play className="h-2.5 w-2.5" /> paused
            </>
          )}
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 max-h-[55vh] lg:max-h-none overflow-y-auto px-2 py-1.5 font-mono text-[10.5px] space-y-0.5"
      >
        {visible.length === 0 && (
          <div className="text-muted-foreground italic text-[11px] py-4 text-center">
            Awaiting events…
          </div>
        )}
        {visible.map((e) => {
          const Icon =
            e.level === "error"
              ? AlertCircle
              : e.level === "warning"
                ? AlertTriangle
                : e.level === "success"
                  ? CheckCircle2
                  : e.kind === "info"
                    ? Info
                    : Loader2;
          return (
            <div
              key={e.id}
              className={cn(
                "flex items-start gap-2 px-1 py-0.5 rounded transition-colors",
                e.level === "error" && "text-red-600 dark:text-red-400",
                e.level === "warning" && "text-amber-600 dark:text-amber-400",
                e.level === "success" && "text-foreground/85",
                e.level === "info" && "text-foreground/70",
              )}
            >
              <span className="tabular-nums text-muted-foreground/70 shrink-0 text-[10px]">
                {formatTime(e.timestamp)}
              </span>
              <Icon
                className={cn(
                  "h-2.5 w-2.5 shrink-0 mt-0.5",
                  e.level === "success" && "text-green-500",
                  e.level === "info" && "text-muted-foreground",
                )}
              />
              <span className="font-semibold shrink-0">{e.primary}</span>
              {e.secondary && (
                <span className="text-muted-foreground truncate">
                  {e.secondary}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
