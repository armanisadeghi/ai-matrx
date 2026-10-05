"use client";

import { cn } from "@ai-matrx/design-system";
import { Hammer } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@ai-matrx/diff/react";
import { InlineTextDiff } from "@ai-matrx/diff/react";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

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
      <div className="grid grid-cols-[200px_1fr_1fr] type-secondary">
        <div className="border-r border-border" />
        <div className="px-3 py-2 border-r border-border">
          <pre className="font-mono type-meta text-foreground/70">
            {oldJson}
          </pre>
        </div>
        <div className="px-3 py-2">
          <pre className="font-mono type-meta text-foreground/70">
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
        const toolName =
          newTool?.name ??
          oldTool?.name ??
          `Unknown custom tool (${child.key ?? "missing id"})`;

        // Edited tool → word/line-level diff so only the changed text/schema
        // is tinted instead of the whole definition.
        if (child.changeType === "modified" && oldTool && newTool) {
          const oldText = formatCustomTool(oldTool);
          const newText = formatCustomTool(newTool);
          if (oldText !== "" && newText !== "") {
            return (
              <div
                key={child.key ?? i}
                className="grid grid-cols-[200px_1fr] type-secondary border-t border-border/30"
              >
                <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8">
                  {humanizeIdentifier(toolName)}
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <InlineTextDiff original={oldText} modified={newText} />
                </div>
              </div>
            );
          }
        }

        return (
          <div
            key={child.key ?? i}
            className="grid grid-cols-[200px_1fr_1fr] type-secondary border-t border-border/30"
          >
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8">
              {humanizeIdentifier(toolName)}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border whitespace-pre-wrap font-mono type-meta",
                child.changeType === "removed" ||
                  child.changeType === "modified"
                  ? "bg-destructive/10 text-destructive bg-destructive/15"
                  : "text-foreground/70",
                child.changeType === "added" ? "text-muted-foreground/50" : "",
              )}
            >
              {formatCustomTool(oldTool)}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 whitespace-pre-wrap font-mono type-meta",
                child.changeType === "added" || child.changeType === "modified"
                  ? "bg-success/10 text-success bg-success/15"
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
