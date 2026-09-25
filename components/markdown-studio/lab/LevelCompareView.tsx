// components/markdown-studio/lab/LevelCompareView.tsx
//
// One source rendered at every <RichContent> level side by side — inline
// (markdown + math as phrasing content, no blocks), standard (blocks, the
// depth-bounded nested pipeline) and full (the chat engine). This is where a
// level difference is SEEN before any surface adopts a level.

"use client";

import React from "react";
import { RichContent } from "@/components/rich-content/RichContent";
import type { RichContentLevel } from "@/components/rich-content/rich-content-types";

const LEVELS: { level: RichContentLevel; label: string; hint: string }[] = [
  { level: "inline", label: "Inline", hint: "Titles, labels, table cells — no blocks" },
  { level: "standard", label: "Standard", hint: "Cards, notes, previews — blocks, bounded nesting" },
  { level: "full", label: "Full", hint: "Chat answers — every kind and block" },
];

export interface LevelCompareViewProps {
  content: string;
}

export function LevelCompareView({ content }: LevelCompareViewProps) {
  if (!content.trim()) {
    return (
      <p className="p-8 text-center text-xs text-muted-foreground">
        Nothing to compare — load or type content first.
      </p>
    );
  }
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-border xl:grid-cols-3 xl:overflow-hidden">
      {LEVELS.map(({ level, label, hint }) => (
        <section
          key={level}
          aria-label={`${label} level`}
          className="flex min-h-0 flex-col bg-card"
        >
          <header className="flex items-baseline gap-2 border-b border-border px-3 py-1.5">
            <span className="text-xs font-semibold">{label}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {hint}
            </span>
          </header>
          <div className="min-h-0 flex-1 p-3 text-sm xl:overflow-auto">
            <RichContent source={content} level={level} />
          </div>
        </section>
      ))}
    </div>
  );
}
