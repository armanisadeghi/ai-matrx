"use client";

import { cn } from "@/lib/utils";
import { Webhook } from "lucide-react";
import type {
  FieldAdapter,
  FieldDiffProps,
  EnrichmentContext,
} from "@/components/diff/adapters/types";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";

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
        {oldId ? (
          <AiModelRef
            modelId={oldId}
            name={oldName}
            showId
            showIcon={false}
            className={cn(
              node.changeType !== "unchanged"
                ? "text-red-700 dark:text-red-300"
                : "text-foreground/80",
            )}
          />
        ) : (
          <span className="text-muted-foreground">Default</span>
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
        {newId ? (
          <AiModelRef
            modelId={newId}
            name={newName}
            showId
            showIcon={false}
            className={cn(
              node.changeType !== "unchanged"
                ? "text-green-700 dark:text-green-300"
                : "text-foreground/80",
            )}
          />
        ) : (
          <span className="text-muted-foreground">Default</span>
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
    const resolvedOld = oldId ? ctx?.resolveModelId(oldId) : null;
    const resolvedNew = newId ? ctx?.resolveModelId(newId) : null;
    const oldName = oldId
      ? resolvedOld && resolvedOld !== oldId
        ? resolvedOld
        : `Unknown AI model (${oldId})`
      : "Default";
    const newName = newId
      ? resolvedNew && resolvedNew !== newId
        ? resolvedNew
        : `Unknown AI model (${newId})`
      : "Default";
    return `${oldName} → ${newName}`;
  },
};
