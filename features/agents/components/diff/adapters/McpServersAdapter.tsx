"use client";

import { cn } from "@/lib/utils";
import { Server } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
  EnrichmentContext,
} from "@/components/diff/adapters/types";

function resolveMcp(id: string, enrichment?: EnrichmentContext): string {
  return enrichment?.resolveMcpServerId(id) ?? id;
}

function McpServersDiffRenderer({ node, enrichment }: FieldDiffProps) {
  const oldServers = Array.isArray(node.oldValue)
    ? (node.oldValue as string[])
    : [];
  const newServers = Array.isArray(node.newValue)
    ? (node.newValue as string[])
    : [];
  const allIds = [...new Set([...oldServers, ...newServers])];

  return (
    <>
      {allIds.map((id) => {
        const inOld = oldServers.includes(id);
        const inNew = newServers.includes(id);
        const name = resolveMcp(id, enrichment);
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
            </div>
          </div>
        );
      })}
    </>
  );
}

export const McpServersAdapter: FieldAdapter = {
  label: "MCP Servers",
  icon: Server,
  renderDiff: McpServersDiffRenderer,
  toSummaryText: (node, ctx) => {
    const oldArr = Array.isArray(node.oldValue)
      ? (node.oldValue as string[])
      : [];
    const newArr = Array.isArray(node.newValue)
      ? (node.newValue as string[])
      : [];
    const added = newArr.filter((s) => !oldArr.includes(s));
    const removed = oldArr.filter((s) => !newArr.includes(s));
    const parts: string[] = [];
    if (added.length > 0)
      parts.push(
        `Added: ${added.map((id) => ctx?.resolveMcpServerId(id) ?? id).join(", ")}`,
      );
    if (removed.length > 0)
      parts.push(
        `Removed: ${removed.map((id) => ctx?.resolveMcpServerId(id) ?? id).join(", ")}`,
      );
    return parts.join("; ") || "MCP servers changed";
  },
};
