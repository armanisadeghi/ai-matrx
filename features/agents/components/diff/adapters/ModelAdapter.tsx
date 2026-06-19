"use client";

import { cn } from "@/lib/utils";
import { Webhook } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
  EnrichmentContext,
} from "@/components/diff/adapters/types";

function ModelDiffRenderer({ node, enrichment }: FieldDiffProps) {
  const oldId = typeof node.oldValue === "string" ? node.oldValue : null;
  const newId = typeof node.newValue === "string" ? node.newValue : null;
  const oldName = oldId ? enrichment?.resolveModelId(oldId) : null;
  const newName = newId ? enrichment?.resolveModelId(newId) : null;

  return (
    <div className="grid grid-cols-[200px_1fr_1fr] text-xs">
      <div className="border-r border-border" />
      <div
        className={cn(
          "px-3 py-2 border-r border-border",
          node.changeType !== "unchanged" ? "bg-red-50 dark:bg-red-950/15" : "",
        )}
      >
        {oldName ? (
          <div>
            <div
              className={cn(
                node.changeType !== "unchanged"
                  ? "text-red-700 dark:text-red-300"
                  : "text-foreground/80",
              )}
            >
              {oldName}
            </div>
            <div className="text-[0.5625rem] text-muted-foreground/60 font-mono mt-0.5">
              {oldId}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">{oldId ?? "Default"}</span>
        )}
      </div>
      <div
        className={cn(
          "px-3 py-2",
          node.changeType !== "unchanged"
            ? "bg-green-50 dark:bg-green-950/15"
            : "",
        )}
      >
        {newName ? (
          <div>
            <div
              className={cn(
                node.changeType !== "unchanged"
                  ? "text-green-700 dark:text-green-300"
                  : "text-foreground/80",
              )}
            >
              {newName}
            </div>
            <div className="text-[0.5625rem] text-muted-foreground/60 font-mono mt-0.5">
              {newId}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">{newId ?? "Default"}</span>
        )}
      </div>
    </div>
  );
}

export const ModelAdapter: FieldAdapter = {
  label: "Model",
  icon: Webhook,
  renderDiff: ModelDiffRenderer,
  toSummaryText: (node, ctx) => {
    const oldId = typeof node.oldValue === "string" ? node.oldValue : null;
    const newId = typeof node.newValue === "string" ? node.newValue : null;
    const oldName = oldId ? (ctx?.resolveModelId(oldId) ?? oldId) : "Default";
    const newName = newId ? (ctx?.resolveModelId(newId) ?? newId) : "Default";
    return `${oldName} → ${newName}`;
  },
};
