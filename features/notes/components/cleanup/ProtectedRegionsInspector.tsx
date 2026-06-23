"use client";

// ProtectedRegionsInspector — the "show me everything you're protecting" panel.
// Lists every region the engine decided to leave untouched, with its kind,
// confidence, line span, and a preview, so the user can verify detection is
// catching the right things (and nothing it shouldn't).

import {
  Code2,
  Braces,
  Table2,
  FileCode,
  Hash,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ProtectedKind,
  ProtectedRegion,
} from "@/lib/content-cleanup/types";

const KIND_LABEL: Record<ProtectedKind, string> = {
  "front-matter": "Front matter",
  "fenced-code": "Code block",
  "inline-code": "Inline code",
  "json-block": "JSON",
  table: "Table",
  "html-block": "HTML",
};

const KIND_ICON: Record<ProtectedKind, React.ComponentType<{ className?: string }>> = {
  "front-matter": Hash,
  "fenced-code": Code2,
  "inline-code": FileCode,
  "json-block": Braces,
  table: Table2,
  "html-block": FileCode,
};

export function ProtectedRegionsInspector({
  regions,
}: {
  regions: ProtectedRegion[];
}) {
  if (regions.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        No code, JSON, tables, or other structured content detected — the whole
        note was safe to clean.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {regions.map((r, i) => {
        const Icon = KIND_ICON[r.kind];
        const certain = r.confidence === "certain";
        return (
          <div
            key={i}
            className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">
                  {KIND_LABEL[r.kind]}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded px-1 py-px text-[0.5625rem] font-medium",
                    certain
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                  )}
                  title={r.reason}
                >
                  {certain ? (
                    <ShieldCheck className="h-2.5 w-2.5" />
                  ) : (
                    <ShieldQuestion className="h-2.5 w-2.5" />
                  )}
                  {certain ? "certain" : "review"}
                </span>
                <span className="text-[0.625rem] text-muted-foreground">
                  {r.lineCount} line{r.lineCount !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="truncate font-mono text-[0.6875rem] text-muted-foreground">
                {r.preview || "(empty)"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
