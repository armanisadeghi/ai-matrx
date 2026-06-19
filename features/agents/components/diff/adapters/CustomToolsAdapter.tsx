"use client";

import { cn } from "@/lib/utils";
import { Hammer } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@/components/diff/adapters/types";

interface CustomToolLike {
  name: string;
  description?: string;
  input_schema?: unknown;
}

function formatCustomTool(tool: CustomToolLike | undefined): string {
  if (!tool) return "—";
  const parts = [tool.name];
  if (tool.description) parts.push(`\n${tool.description}`);
  if (tool.input_schema)
    parts.push(`\nSchema: ${JSON.stringify(tool.input_schema, null, 2)}`);
  return parts.join("");
}

function CustomToolsDiffRenderer({ node }: FieldDiffProps) {
  if (!node.children || node.children.length === 0) {
    const oldJson = JSON.stringify(node.oldValue, null, 2) ?? "—";
    const newJson = JSON.stringify(node.newValue, null, 2) ?? "—";
    return (
      <div className="grid grid-cols-[200px_1fr_1fr] text-xs">
        <div className="border-r border-border" />
        <div className="px-3 py-2 border-r border-border">
          <pre className="font-mono text-[0.625rem] text-foreground/70">
            {oldJson}
          </pre>
        </div>
        <div className="px-3 py-2">
          <pre className="font-mono text-[0.625rem] text-foreground/70">
            {newJson}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <>
      {node.children.map((child, i) => {
        const oldTool = child.oldValue as CustomToolLike | undefined;
        const newTool = child.newValue as CustomToolLike | undefined;
        const toolName = newTool?.name ?? oldTool?.name ?? child.key;

        return (
          <div
            key={child.key ?? i}
            className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30"
          >
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
              {toolName}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border whitespace-pre-wrap font-mono text-[0.625rem]",
                child.changeType === "removed" ||
                  child.changeType === "modified"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
                  : "text-foreground/70",
                child.changeType === "added" ? "text-muted-foreground/50" : "",
              )}
            >
              {formatCustomTool(oldTool)}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 whitespace-pre-wrap font-mono text-[0.625rem]",
                child.changeType === "added" || child.changeType === "modified"
                  ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
                  : "text-foreground/70",
                child.changeType === "removed"
                  ? "text-muted-foreground/50"
                  : "",
              )}
            >
              {formatCustomTool(newTool)}
            </div>
          </div>
        );
      })}
    </>
  );
}

export const CustomToolsAdapter: FieldAdapter = {
  label: "Custom Tools",
  icon: Hammer,
  renderDiff: CustomToolsDiffRenderer,
  toSummaryText: (node) => {
    if (!node.children) return "Custom tools changed";
    const changed = node.children.filter((c) => c.changeType !== "unchanged");
    const added = changed.filter((c) => c.changeType === "added").length;
    const removed = changed.filter((c) => c.changeType === "removed").length;
    const modified = changed.filter((c) => c.changeType === "modified").length;
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (removed > 0) parts.push(`${removed} removed`);
    if (modified > 0) parts.push(`${modified} modified`);
    return parts.join(", ") || "Custom tools changed";
  },
};
