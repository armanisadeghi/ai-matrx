"use client";

import { useCallback, useMemo, useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResearchMedia } from "../../types";
import {
  buildMediaDebugPayload,
  CATEGORIZATION_RULES,
  GRAPHIC_MAX_DIM,
  ICON_MAX_DIM,
  SQUARE_ASPECT_TOLERANCE,
} from "./mediaCategorization";
import { toast } from "sonner";

interface MediaDebugPanelProps {
  topicId: string;
  items: ResearchMedia[];
  totalCount: number;
  scope: "all" | "filtered";
  className?: string;
}

export default function MediaDebugPanel({
  topicId,
  items,
  totalCount,
  scope,
  className,
}: MediaDebugPanelProps) {
  const [copied, setCopied] = useState(false);

  const payload = useMemo(
    () =>
      buildMediaDebugPayload(topicId, items, {
        scope,
        totalCount,
      }),
    [topicId, items, scope, totalCount],
  );

  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  const debugHref = `/research/topics/${topicId}/media/debug`;

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      toast.success("Copied media debug summary");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }, [json]);

  const q = payload.dataQuality;

  return (
    <div className={cn("flex flex-col gap-3 min-h-0", className)}>
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground/80">
            Categorization debug
          </p>
          <p className="text-[10px] text-muted-foreground">
            Slim export — only fields used for sorting.{" "}
            {scope === "filtered"
              ? `${payload.counts.shown} filtered of ${payload.counts.total}`
              : `${payload.counts.shown} items`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1.5 shrink-0"
          onClick={handleCopyAll}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          Copy all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1.5 shrink-0"
          asChild
        >
          <a href={debugHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3" />
            Open in new tab
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-1">
        <Stat
          label="DB has W×H"
          value={q.dbDimensions}
          warn={q.dbDimensions === 0}
        />
        <Stat label="URL inferred" value={q.urlInferredDimensions} />
        <Stat label="Both dims" value={q.bothDimensions} />
        <Stat
          label="No dims at all"
          value={q.noDimensions}
          warn={q.noDimensions > 0}
        />
      </div>

      <div className="rounded-xl matrx-glass-card border border-border/40 overflow-hidden flex flex-col min-h-[280px] max-h-[calc(100dvh-16rem)]">
        <div className="px-3 py-2 border-b border-border/40 bg-muted/20 space-y-1">
          <p className="text-[10px] text-muted-foreground">
            Tiers: icon ≤{ICON_MAX_DIM} · graphic &lt;{GRAPHIC_MAX_DIM} · photo
            ≥{GRAPHIC_MAX_DIM} · square ±
            {Math.round(SQUARE_ASPECT_TOLERANCE * 100)}%
          </p>
          <p className="text-[10px] text-foreground/70">
            Summary — tier: {JSON.stringify(payload.summary.tier)} · aspect:{" "}
            {JSON.stringify(payload.summary.aspect)}
          </p>
          {q.dbDimensions === 0 && (
            <p className="text-[10px] text-warning">
              rs_media.width/height are null for this topic — aspect splits use
              URL parsing (?w=&amp;h=, 384x256 paths, etc.) until scrape stores
              dims.
            </p>
          )}
        </div>
        <pre className="flex-1 overflow-auto p-3 text-[10px] leading-relaxed font-mono text-foreground/90 whitespace-pre-wrap break-all">
          {json}
        </pre>
      </div>

      <details className="rounded-lg matrx-glass-thin-border px-3 py-2">
        <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer">
          Rules reference
        </summary>
        <pre className="mt-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">
          {JSON.stringify(CATEGORIZATION_RULES, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg matrx-glass-thin-border px-2 py-1.5">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-semibold tabular-nums",
          warn ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
