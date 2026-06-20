"use client";

/**
 * CtxItemCard — the note-card display for ONE context item.
 *
 * Shared by every CTX renderer (`ctx_get`, `ctx_batch`). Renders a single
 * resolved context object — `{ key, type, label, content }` (or `summary`
 * in summary mode) — as a polished note card: a header row carrying the
 * type icon, the human label, the raw key, and an optional size badge, then
 * the value itself via the recursive `<ResultValue>` field library.
 *
 * The component is deliberately shape-tolerant: the server `type` field is a
 * free string, so the icon is resolved through a string-keyed map with a
 * `Layers` fallback. `content` is handed straight to `<ResultValue>`, which
 * already knows how to render markdown, tables, json, media, and scalars by
 * shape — this card never reimplements rendering.
 */

import React from "react";
import {
  FileText,
  File,
  Braces,
  Database,
  User,
  Building2,
  LayoutGrid,
  FolderKanban,
  SquareCheck,
  Variable,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { ResultValue, type ResultDensity } from "../../result-fields/ResultValue";

// ---------------------------------------------------------------------------
// Type → icon. Keyed by the raw server `type` string (not the strict
// ContextObjectType union) so an unexpected value degrades gracefully to
// `Layers` rather than crashing or rendering nothing.
// ---------------------------------------------------------------------------

const CTX_TYPE_ICON: Record<string, LucideIcon> = {
  text: FileText,
  file_url: File,
  json: Braces,
  db_ref: Database,
  user: User,
  org: Building2,
  workspace: LayoutGrid,
  project: FolderKanban,
  task: SquareCheck,
  variable: Variable,
};

function iconForType(type: string | undefined): LucideIcon {
  if (!type) return Layers;
  return CTX_TYPE_ICON[type] ?? Layers;
}

// ---------------------------------------------------------------------------
// Item shape — defensive. Every field is optional; the server contract is
// `{ key, type, label, content }` with `summary` replacing `content` in
// summary mode, plus paging metadata we surface as a size hint.
// ---------------------------------------------------------------------------

export interface CtxItem {
  key?: string;
  type?: string;
  label?: string;
  content?: unknown;
  summary?: string;
  total_chars?: number;
  chars_returned?: number;
  has_more?: boolean;
}

export interface CtxItemCardProps {
  item: CtxItem;
  density: ResultDensity;
  className?: string;
}

function formatCharCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k chars`;
  }
  return `${n} char${n === 1 ? "" : "s"}`;
}

export const CtxItemCard: React.FC<CtxItemCardProps> = ({
  item,
  density,
  className,
}) => {
  const Icon = iconForType(item.type);
  const label = item.label || item.key || "Context";
  const showKey = item.key && item.key !== label;

  // Prefer the returned-chars count (page mode) but fall back to the total.
  const sizeChars =
    typeof item.chars_returned === "number"
      ? item.chars_returned
      : typeof item.total_chars === "number"
        ? item.total_chars
        : null;

  // Summary mode delivers a `summary` string in place of `content`.
  const isSummary = typeof item.summary === "string" && item.summary.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 space-y-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 truncate font-medium text-foreground">
          {label}
        </span>
        {showKey && (
          <span className="shrink-0 truncate font-mono text-xs text-muted-foreground">
            {item.key}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {isSummary && (
            <Badge variant="secondary" className="font-normal">
              summary
            </Badge>
          )}
          {sizeChars != null && (
            <Badge variant="secondary" className="font-normal tabular-nums">
              {formatCharCount(sizeChars)}
            </Badge>
          )}
        </span>
      </div>

      <div className="min-w-0">
        {isSummary ? (
          <ResultValue value={item.summary} density={density} />
        ) : (
          <ResultValue value={item.content} density={density} />
        )}
      </div>
    </div>
  );
};
