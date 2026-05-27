"use client";

/**
 * SourceKindBadge — color-coded indicator for `tool_def.source_kind`.
 *
 * Post-2026 tool-system refactor, the old `source_app` derived-from-path
 * field is gone. Tools now declare provenance explicitly via the `source_kind`
 * enum on `tool_def`. Four values, each rendered with its own semantic color.
 */

import React from "react";
import { cn } from "@/styles/themes/utils";

export type ToolSourceKind =
  | "native"
  | "mcp_discovered"
  | "admin_authored"
  | "agent_authored";

export const TOOL_SOURCE_KIND_VALUES: readonly ToolSourceKind[] = [
  "native",
  "admin_authored",
  "agent_authored",
  "mcp_discovered",
] as const;

const LABELS: Record<ToolSourceKind, string> = {
  native: "Native",
  mcp_discovered: "MCP",
  admin_authored: "Admin",
  agent_authored: "Agent",
};

const CLASSES: Record<ToolSourceKind, string> = {
  // Native — built into matrx-ai-core (green: trusted, first-class).
  native: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  // Admin-authored — hand-rolled by a human admin (blue: human-managed).
  admin_authored: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  // Agent-authored — synthesized by an agent at runtime (purple).
  agent_authored: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
  // MCP-discovered — auto-imported from an MCP server (amber: external).
  mcp_discovered: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

export function sourceKindLabel(kind: string | null | undefined): string {
  if (!kind) return "—";
  if (kind in LABELS) return LABELS[kind as ToolSourceKind];
  return kind;
}

export function SourceKindBadge({
  kind,
  className,
}: {
  kind: string | null | undefined;
  className?: string;
}) {
  if (!kind) {
    return (
      <span className="text-[10px] text-muted-foreground">—</span>
    );
  }
  const cls = (kind in CLASSES)
    ? CLASSES[kind as ToolSourceKind]
    : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-block text-[10px] h-4 px-1.5 rounded border leading-4",
        cls,
        className,
      )}
    >
      {sourceKindLabel(kind)}
    </span>
  );
}
