"use client";

import { cn } from "@ai-matrx/design-system";
import { Layers } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@ai-matrx/diff/react";
import type { DiffNode } from "@ai-matrx/diff/structural";
import { InlineTextDiff } from "@ai-matrx/diff/react";

interface ContextPolicyLike {
  key: string;
  type?: string;
  label?: string;
  description?: string;
}

function formatPolicy(policy: ContextPolicyLike | undefined): string {
  if (!policy) return "—";
  const parts = [policy.key];
  if (policy.type) parts.push(`[${policy.type}]`);
  if (policy.label) parts.push(`"${policy.label}"`);
  if (policy.description) parts.push(`\n${policy.description}`);
  return parts.join(" ");
}

function ContextPoliciesDiffRenderer({ node }: FieldDiffProps) {
  if (!node.children || node.children.length === 0) {
    const oldJson =
      node.oldValue != null ? JSON.stringify(node.oldValue, null, 2) : "—";
    const newJson =
      node.newValue != null ? JSON.stringify(node.newValue, null, 2) : "—";
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
        const oldPolicy = child.oldValue as ContextPolicyLike | undefined;
        const newPolicy = child.newValue as ContextPolicyLike | undefined;
        const policyKey = newPolicy?.key ?? oldPolicy?.key ?? child.key;

        // Edited policy → word/line-level diff so only the changed text is tinted.
        if (child.changeType === "modified" && oldPolicy && newPolicy) {
          const oldText = formatPolicy(oldPolicy);
          const newText = formatPolicy(newPolicy);
          if (oldText !== "" && newText !== "") {
            return (
              <div
                key={child.key ?? i}
                className="grid grid-cols-[200px_1fr] type-secondary border-t border-border/30"
              >
                <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
                  {policyKey}
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
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
              {policyKey}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border whitespace-pre-wrap",
                child.changeType === "removed" ||
                  child.changeType === "modified"
                  ? "bg-destructive/10 text-destructive bg-destructive/15"
                  : "text-foreground/80",
                child.changeType === "added" ? "text-muted-foreground/50" : "",
              )}
            >
              {formatPolicy(oldPolicy)}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 whitespace-pre-wrap",
                child.changeType === "added" || child.changeType === "modified"
                  ? "bg-success/10 text-success bg-success/15"
                  : "text-foreground/80",
                child.changeType === "removed"
                  ? "text-muted-foreground/50"
                  : "",
              )}
            >
              {formatPolicy(newPolicy)}
            </div>
          </div>
        );
      })}
    </>
  );
}

export const ContextPoliciesAdapter: FieldAdapter = {
  label: "Context Policies",
  icon: Layers,
  renderDiff: ContextPoliciesDiffRenderer,
  toSummaryText: (node) => {
    if (!node.children) return "Context policies changed";
    const changed = node.children.filter(
      (c) => c.changeType !== "unchanged",
    ).length;
    return `${changed} policy${changed !== 1 ? "s" : ""} changed`;
  },
};
