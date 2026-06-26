"use client";

/**
 * StatsBlock — the in-chat render block for ```stats fences.
 *
 * A small JSON spec of headline metrics renders as a grid of KPI cards (big
 * value, label, colored up/down delta). Light — no chart lib — so it's the
 * fast way to surface "the numbers" (charts are for trends; stats are for the
 * headline figures). Streaming → skeleton; invalid JSON → contained error.
 */

import React, { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Check, Copy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatItem {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "flat";
  hint?: string;
}
interface StatsSpec {
  title?: string;
  stats: StatItem[];
}

export interface StatsBlockProps {
  content?: string;
  isStreamActive?: boolean;
  className?: string;
}

function parseStats(raw: string): StatsSpec | { error: string } {
  let s = raw.trim();
  const fenced = /^```(?:json|stats)?\s*\n([\s\S]*?)\n?```$/.exec(s);
  if (fenced) s = fenced[1].trim();
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    try {
      obj = JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return { error: "Stats needs a JSON object with a `stats` array." };
    }
  }
  const arr = Array.isArray(obj) ? obj : Array.isArray((obj as { stats?: unknown }).stats) ? (obj as { stats: unknown[] }).stats : null;
  if (!arr || arr.length === 0) return { error: "Stats `stats` must be a non-empty array." };
  const title = !Array.isArray(obj) && typeof (obj as { title?: unknown }).title === "string" ? (obj as { title: string }).title : undefined;
  const stats: StatItem[] = (arr as Record<string, unknown>[])
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const change = r.change != null ? String(r.change) : undefined;
      let trend = (r.trend as StatItem["trend"]) ?? undefined;
      if (!trend && change) trend = /^-|↓|▼/.test(change.trim()) ? "down" : /^\+|↑|▲/.test(change.trim()) ? "up" : undefined;
      return {
        label: String(r.label ?? r.name ?? ""),
        value: String(r.value ?? r.amount ?? r.count ?? ""),
        change,
        trend,
        hint: r.hint != null ? String(r.hint) : undefined,
      };
    });
  return { title, stats };
}

const TREND = {
  up: { cls: "text-emerald-600 dark:text-emerald-400", Icon: ArrowUpRight },
  down: { cls: "text-rose-600 dark:text-rose-400", Icon: ArrowDownRight },
  flat: { cls: "text-muted-foreground", Icon: ArrowRight },
};

export const StatsBlock: React.FC<StatsBlockProps> = ({ content = "", isStreamActive = false, className }) => {
  const parsed = useMemo(() => (isStreamActive ? null : parseStats(content)), [content, isStreamActive]);
  const spec = parsed && !("error" in parsed) ? parsed : null;
  const error = parsed && "error" in parsed ? parsed.error : null;
  const [copied, setCopied] = useState(false);

  const cols = spec ? Math.min(spec.stats.length, 4) : 3;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">{spec?.title ?? "Key metrics"}</span>
          {isStreamActive && <span className="shrink-0 animate-pulse text-xs text-muted-foreground">…</span>}
        </div>
        {!isStreamActive && spec && (
          <button
            type="button"
            aria-label={copied ? "Copied" : "Copy source"}
            title={copied ? "Copied" : "Copy source"}
            onClick={handleCopy}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="p-3">
        {isStreamActive ? (
          <div className="grid grid-cols-3 gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : spec ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {spec.stats.map((s, i) => {
              const t = s.trend ? TREND[s.trend] : null;
              return (
                <div key={i} className="rounded-xl border border-border bg-muted/30 p-4">
                  <div className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{s.value}</div>
                  {s.change && (
                    <div className={cn("mt-1 flex items-center gap-0.5 text-xs font-medium", t?.cls)}>
                      {t && <t.Icon className="h-3.5 w-3.5" />}
                      {s.change}
                    </div>
                  )}
                  {s.hint && <div className="mt-1 truncate text-[11px] text-muted-foreground">{s.hint}</div>}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default StatsBlock;
