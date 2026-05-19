// components/markdown-studio/BlockStatsCard.tsx
// Compact visual summary of detected blocks: a stacked horizontal bar
// segmented by block type, plus per-type counts as colored chips.

"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getBlockTypeStyle } from "./block-type-colors";

interface BlockStatsCardProps {
  blocks: Array<{ type: string; content: string }>;
  className?: string;
}

interface TypeStat {
  type: string;
  count: number;
  bytes: number;
}

export function BlockStatsCard({ blocks, className }: BlockStatsCardProps) {
  const { byType, totalBytes, totalCount } = useMemo(() => {
    const map = new Map<string, TypeStat>();
    let totalBytes = 0;
    for (const b of blocks) {
      const bytes = (b.content ?? "").length;
      totalBytes += bytes;
      const existing = map.get(b.type);
      if (existing) {
        existing.count += 1;
        existing.bytes += bytes;
      } else {
        map.set(b.type, { type: b.type, count: 1, bytes });
      }
    }
    const sorted = Array.from(map.values()).sort((a, b) => b.bytes - a.bytes);
    return {
      byType: sorted,
      totalBytes,
      totalCount: blocks.length,
    };
  }, [blocks]);

  if (totalCount === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground",
          className,
        )}
      >
        No blocks detected yet — start typing or load a template.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/40 p-2.5 space-y-2",
        className,
      )}
    >
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
          Block atlas
        </h4>
        <span className="text-[10px] text-muted-foreground font-mono">
          {totalCount} {totalCount === 1 ? "block" : "blocks"} · {totalBytes} B
        </span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
        {byType.map((stat) => {
          const pct = totalBytes > 0 ? (stat.bytes / totalBytes) * 100 : 0;
          const style = getBlockTypeStyle(stat.type);
          return (
            <div
              key={stat.type}
              className={cn("h-full", style.bg)}
              style={{ width: `${pct}%` }}
              title={`${stat.type}: ${stat.count}× · ${stat.bytes} B`}
            />
          );
        })}
      </div>

      {/* Per-type chips */}
      <div className="flex flex-wrap gap-1">
        {byType.map((stat) => {
          const style = getBlockTypeStyle(stat.type);
          return (
            <span
              key={stat.type}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                style.bg,
                style.text,
                style.border,
              )}
              title={`${stat.bytes} B · ${stat.count} ${stat.count === 1 ? "block" : "blocks"}`}
            >
              <span className="font-mono">{stat.count}</span>
              <span>{style.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
