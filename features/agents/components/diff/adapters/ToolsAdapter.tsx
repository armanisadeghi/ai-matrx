"use client";

import { cn } from "@/lib/utils";
import { Wrench } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
  EnrichmentContext,
} from "@/components/diff/adapters/types";

function resolveTool(id: string, enrichment?: EnrichmentContext): string {
  return enrichment?.resolveToolId(id) ?? id;
}

function ToolsDiffRenderer({ node, enrichment }: FieldDiffProps) {
  const oldTools = Array.isArray(node.oldValue)
    ? (node.oldValue as string[])
    : [];
  const newTools = Array.isArray(node.newValue)
    ? (node.newValue as string[])
    : [];

  // Build a merged list showing all tools from both versions
  const allToolIds = [...new Set([...oldTools, ...newTools])];

  return (
    <>
      {allToolIds.map((id) => {
        const inOld = oldTools.includes(id);
        const inNew = newTools.includes(id);
        const name = resolveTool(id, enrichment);
        const status =
          inOld && inNew ? "unchanged" : inOld ? "removed" : "added";

        return (
          <div
            key={id}
            className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30"
          >
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono truncate">
              {name}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border",
                status === "removed"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
                  : "",
                status === "added" ? "text-muted-foreground/50" : "",
                status === "unchanged" ? "text-foreground/80" : "",
              )}
            >
              {inOld ? name : "—"}
              {inOld && (
                <span className="text-[0.5625rem] text-muted-foreground/50 font-mono ml-2">
                  {id.slice(0, 8)}
                </span>
              )}
            </div>
            <div
              className={cn(
                "px-3 py-1.5",
                status === "added"
                  ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
                  : "",
                status === "removed" ? "text-muted-foreground/50" : "",
                status === "unchanged" ? "text-foreground/80" : "",
              )}
            >
              {inNew ? name : "—"}
              {inNew && (
                <span className="text-[0.5625rem] text-muted-foreground/50 font-mono ml-2">
                  {id.slice(0, 8)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

export const ToolsAdapter: FieldAdapter = {
  label: "Tools",
  icon: Wrench,
  renderDiff: ToolsDiffRenderer,
  toSummaryText: (node, ctx) => {
    const oldArr = Array.isArray(node.oldValue)
      ? (node.oldValue as string[])
      : [];
    const newArr = Array.isArray(node.newValue)
      ? (node.newValue as string[])
      : [];
    const added = newArr.filter((t) => !oldArr.includes(t));
    const removed = oldArr.filter((t) => !newArr.includes(t));
    const parts: string[] = [];
    if (added.length > 0)
      parts.push(
        `Added: ${added.map((id) => ctx?.resolveToolId(id) ?? id).join(", ")}`,
      );
    if (removed.length > 0)
      parts.push(
        `Removed: ${removed.map((id) => ctx?.resolveToolId(id) ?? id).join(", ")}`,
      );
    return parts.join("; ") || "Tools changed";
  },
};
