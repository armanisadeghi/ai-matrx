"use client";

import { cn } from "@ai-matrx/design-system";
import { Wrench } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
  EnrichmentContext,
} from "@ai-matrx/diff/react";
import { AiToolRef } from "@ai-matrx/chat/agents/components/identity-refs/AiIdentityRef";

function resolveTool(id: string, enrichment?: EnrichmentContext): string {
  return enrichment?.resolveToolId(id) ?? id;
}

function summarizeTool(id: string, enrichment?: EnrichmentContext): string {
  const name = enrichment?.resolveToolId(id);
  return name && name !== id ? name : `Unknown tool (${id})`;
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
            className="grid grid-cols-[200px_1fr_1fr] type-secondary border-t border-border/30"
          >
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 min-w-0">
              <AiToolRef
                toolId={id}
                name={name === id ? undefined : name}
                showId
                showIcon={false}
              />
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border",
                status === "removed"
                  ? "bg-destructive/10 text-destructive-ink bg-destructive/15"
                  : "",
                status === "added" ? "text-muted-foreground/50" : "",
                status === "unchanged" ? "text-foreground/80" : "",
              )}
            >
              {inOld ? (
                <AiToolRef
                  toolId={id}
                  name={name === id ? undefined : name}
                  showIcon={false}
                />
              ) : (
                "—"
              )}
            </div>
            <div
              className={cn(
                "px-3 py-1.5",
                status === "added"
                  ? "bg-success/10 text-success-ink bg-success/15"
                  : "",
                status === "removed" ? "text-muted-foreground/50" : "",
                status === "unchanged" ? "text-foreground/80" : "",
              )}
            >
              {inNew ? (
                <AiToolRef
                  toolId={id}
                  name={name === id ? undefined : name}
                  showIcon={false}
                />
              ) : (
                "—"
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
        `Added: ${added.map((id) => summarizeTool(id, ctx)).join(", ")}`,
      );
    if (removed.length > 0)
      parts.push(
        `Removed: ${removed.map((id) => summarizeTool(id, ctx)).join(", ")}`,
      );
    return parts.join("; ") || "Tools changed";
  },
};
