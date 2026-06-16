"use client";

/**
 * ChartBlock — the in-chat render block for ```chart fences.
 *
 * The agent emits a small JSON spec; we render it with recharts. JSON can't
 * render until it's complete, so we show a skeleton while the fence streams and
 * the chart on close. Invalid JSON shows a contained error card with the source.
 *
 * BUNDLE POLICY: this block is light (no recharts here). The recharts renderer
 * lives in ChartCanvas and is loaded ONLY through `next/dynamic ssr:false`,
 * rendered conditionally — so recharts never enters the server build or the
 * initial bundle; it loads on demand the first time a chart actually draws.
 */

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { BarChart3, Check, Copy, Expand, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { parseChartSpec, type ChartSpec } from "./chart-spec";

const CHART_TYPE_LABEL: Record<string, string> = {
  bar: "Bar chart",
  line: "Line chart",
  area: "Area chart",
  pie: "Pie chart",
  scatter: "Scatter chart",
};

// recharts is isolated here: a separate ssr:false chunk, loaded on demand.
const ChartCanvas = dynamic(() => import("./ChartCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export interface ChartBlockProps {
  content?: string;
  isStreamActive?: boolean;
  className?: string;
}

export const ChartBlock: React.FC<ChartBlockProps> = ({ content = "", isStreamActive = false, className }) => {
  const source = content.trim();
  const parsed = useMemo(() => (isStreamActive ? null : parseChartSpec(source)), [source, isStreamActive]);
  const spec = parsed && !("error" in parsed) ? (parsed as ChartSpec) : null;
  const error = parsed && "error" in parsed ? parsed.error : null;

  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const title = spec?.title ?? (spec ? CHART_TYPE_LABEL[spec.type] ?? "Chart" : "Chart");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the chart source");
    }
  };

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {spec && (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {CHART_TYPE_LABEL[spec.type] ?? "Chart"}
            </span>
          )}
          {isStreamActive && (
            <span className="shrink-0 animate-pulse text-xs text-muted-foreground">building…</span>
          )}
        </div>
        {!isStreamActive && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconBtn label={copied ? "Copied" : "Copy chart source"} onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </IconBtn>
            {spec && (
              <IconBtn label="View fullscreen" onClick={() => setFullscreen(true)}>
                <Expand className="h-3.5 w-3.5" />
              </IconBtn>
            )}
          </div>
        )}
      </div>

      <div className="p-3">
        {isStreamActive ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error ? (
          <ChartError error={error} source={source} show={showSource} onToggle={() => setShowSource((v) => !v)} />
        ) : spec ? (
          <div className="h-[340px] w-full">
            <ChartCanvas spec={spec} />
          </div>
        ) : null}
      </div>

      {fullscreen && spec && <ChartFullscreen spec={spec} title={title} onClose={() => setFullscreen(false)} />}
    </div>
  );
};

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
    >
      {children}
    </button>
  );
}

function ChartError({
  error,
  source,
  show,
  onToggle,
}: {
  error: string;
  source: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-medium text-foreground">This chart could not be drawn</p>
          <p className="break-words text-xs text-muted-foreground">{error}</p>
          <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={onToggle}>
            {show ? "Hide source" : "Show source"}
          </button>
          {show && (
            <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
              {source}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartFullscreen({ spec, title, onClose }: { spec: ChartSpec; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-background/98 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2 pt-safe">
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        <button
          type="button"
          aria-label="Exit fullscreen"
          title="Exit fullscreen (Esc)"
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 p-6">
        <ChartCanvas spec={spec} />
      </div>
    </div>,
    document.body,
  );
}

export default ChartBlock;
