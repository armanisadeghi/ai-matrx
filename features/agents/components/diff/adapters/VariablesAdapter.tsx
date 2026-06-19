"use client";

import { cn } from "@/lib/utils";
import { Variable } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@/components/diff/adapters/types";
import type { DiffNode } from "@/components/diff/engine/types";
import {
  filterChanges,
  formatValue,
} from "@/components/diff/engine/diff-utils";
import { InlineTextDiff } from "@/components/diff/adapters/InlineTextDiff";

interface VariableLike {
  name: string;
  type?: string;
  defaultValue?: unknown;
  helpText?: string;
  required?: boolean;
}

function formatVar(v: VariableLike | undefined): string {
  if (!v) return "—";
  const parts = [`{{${v.name}}}`];
  if (v.type) parts.push(`[${v.type}]`);
  if (v.defaultValue !== undefined)
    parts.push(`= ${formatValue(v.defaultValue)}`);
  if (v.required) parts.push("(required)");
  if (v.helpText) parts.push(`\n${v.helpText}`);
  return parts.join(" ");
}

function VariablesDiffRenderer({ node }: FieldDiffProps) {
  if (node.children && node.children.length > 0) {
    return (
      <>
        {node.children.map((child, i) => (
          <VariableRow key={child.key ?? i} child={child} />
        ))}
      </>
    );
  }

  // Fallback: compare arrays directly
  const oldVars = Array.isArray(node.oldValue)
    ? (node.oldValue as VariableLike[])
    : [];
  const newVars = Array.isArray(node.newValue)
    ? (node.newValue as VariableLike[])
    : [];
  const maxLen = Math.max(oldVars.length, newVars.length);

  return (
    <>
      {Array.from({ length: maxLen }, (_, i) => {
        const oldVar = oldVars[i];
        const newVar = newVars[i];
        const changed = JSON.stringify(oldVar) !== JSON.stringify(newVar);
        return (
          <div
            key={i}
            className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30"
          >
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
              {newVar?.name ?? oldVar?.name ?? `#${i + 1}`}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border whitespace-pre-wrap",
                changed && oldVar
                  ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
                  : "text-foreground/80",
                !oldVar ? "text-muted-foreground/50" : "",
              )}
            >
              {formatVar(oldVar)}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 whitespace-pre-wrap",
                changed && newVar
                  ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
                  : "text-foreground/80",
                !newVar ? "text-muted-foreground/50" : "",
              )}
            >
              {formatVar(newVar)}
            </div>
          </div>
        );
      })}
    </>
  );
}

function VariableRow({ child }: { child: DiffNode }) {
  const oldVar = child.oldValue as VariableLike | undefined;
  const newVar = child.newValue as VariableLike | undefined;
  const varName = newVar?.name ?? oldVar?.name ?? child.key;

  // Edited variable → word/line-level diff so only the changed text is tinted
  // (the old renderer lit up the entire old/new value for any change).
  if (child.changeType === "modified" && oldVar && newVar) {
    const oldText = formatVar(oldVar);
    const newText = formatVar(newVar);
    if (oldText !== "" && newText !== "") {
      return (
        <div className="grid grid-cols-[200px_1fr] text-xs border-t border-border/30">
          <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
            {"{{" + varName + "}}"}
          </div>
          <div className="min-w-0 overflow-x-auto">
            <InlineTextDiff original={oldText} modified={newText} />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30">
      <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
        {"{{" + varName + "}}"}
      </div>
      <div
        className={cn(
          "px-3 py-1.5 border-r border-border whitespace-pre-wrap",
          child.changeType === "removed"
            ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
            : "",
          child.changeType === "modified"
            ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
            : "",
          child.changeType === "added" ? "text-muted-foreground/50" : "",
          child.changeType === "unchanged" ? "text-foreground/80" : "",
        )}
      >
        {formatVar(oldVar)}
      </div>
      <div
        className={cn(
          "px-3 py-1.5 whitespace-pre-wrap",
          child.changeType === "added"
            ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
            : "",
          child.changeType === "modified"
            ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
            : "",
          child.changeType === "removed" ? "text-muted-foreground/50" : "",
          child.changeType === "unchanged" ? "text-foreground/80" : "",
        )}
      >
        {formatVar(newVar)}
      </div>
    </div>
  );
}

export const VariablesAdapter: FieldAdapter = {
  label: "Variables",
  icon: Variable,
  renderDiff: VariablesDiffRenderer,
  toSummaryText: (node) => {
    if (!node.children) return "Variables changed";
    const changed = node.children.filter((c) => c.changeType !== "unchanged");
    const added = changed.filter((c) => c.changeType === "added").length;
    const removed = changed.filter((c) => c.changeType === "removed").length;
    const modified = changed.filter((c) => c.changeType === "modified").length;
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (removed > 0) parts.push(`${removed} removed`);
    if (modified > 0) parts.push(`${modified} modified`);
    return parts.join(", ") || "Variables changed";
  },
};
