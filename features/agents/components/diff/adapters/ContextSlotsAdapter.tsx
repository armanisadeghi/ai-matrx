"use client";

import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@/components/diff/adapters/types";
import type { DiffNode } from "@/components/diff/engine/types";
import { formatValue } from "@/components/diff/engine/diff-utils";

interface ContextSlotLike {
  key: string;
  type?: string;
  label?: string;
  description?: string;
}

function formatSlot(slot: ContextSlotLike | undefined): string {
  if (!slot) return "—";
  const parts = [slot.key];
  if (slot.type) parts.push(`[${slot.type}]`);
  if (slot.label) parts.push(`"${slot.label}"`);
  if (slot.description) parts.push(`\n${slot.description}`);
  return parts.join(" ");
}

function ContextSlotsDiffRenderer({ node }: FieldDiffProps) {
  if (!node.children || node.children.length === 0) {
    const oldJson =
      node.oldValue != null ? JSON.stringify(node.oldValue, null, 2) : "—";
    const newJson =
      node.newValue != null ? JSON.stringify(node.newValue, null, 2) : "—";
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
        const oldSlot = child.oldValue as ContextSlotLike | undefined;
        const newSlot = child.newValue as ContextSlotLike | undefined;
        const slotKey = newSlot?.key ?? oldSlot?.key ?? child.key;

        return (
          <div
            key={child.key ?? i}
            className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30"
          >
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
              {slotKey}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border whitespace-pre-wrap",
                child.changeType === "removed" ||
                  child.changeType === "modified"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
                  : "text-foreground/80",
                child.changeType === "added" ? "text-muted-foreground/50" : "",
              )}
            >
              {formatSlot(oldSlot)}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 whitespace-pre-wrap",
                child.changeType === "added" || child.changeType === "modified"
                  ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
                  : "text-foreground/80",
                child.changeType === "removed"
                  ? "text-muted-foreground/50"
                  : "",
              )}
            >
              {formatSlot(newSlot)}
            </div>
          </div>
        );
      })}
    </>
  );
}

export const ContextSlotsAdapter: FieldAdapter = {
  label: "Context Slots",
  icon: Layers,
  renderDiff: ContextSlotsDiffRenderer,
  toSummaryText: (node) => {
    if (!node.children) return "Context slots changed";
    const changed = node.children.filter(
      (c) => c.changeType !== "unchanged",
    ).length;
    return `${changed} slot${changed !== 1 ? "s" : ""} changed`;
  },
};
