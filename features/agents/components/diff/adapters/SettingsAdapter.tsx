"use client";

import { cn } from "@ai-matrx/design-system";
import { Settings } from "lucide-react";
import {
  filterChanges,
  formatValue,
} from "@ai-matrx/diff/structural";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@ai-matrx/diff/react";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

function SettingsDiffRenderer({ node }: FieldDiffProps) {
  // Use children if available (decomposed by diff engine)
  const entries = node.children ?? buildEntries();

  function buildEntries() {
    const oldSettings = (node.oldValue ?? {}) as Record<string, unknown>;
    const newSettings = (node.newValue ?? {}) as Record<string, unknown>;
    const allKeys = [
      ...new Set([...Object.keys(oldSettings), ...Object.keys(newSettings)]),
    ];
    return allKeys.map((key) => ({
      path: [key],
      key,
      changeType:
        JSON.stringify(oldSettings[key]) === JSON.stringify(newSettings[key])
          ? ("unchanged" as const)
          : ("modified" as const),
      oldValue: oldSettings[key],
      newValue: newSettings[key],
    }));
  }

  return (
    <>
      {entries.map((child) => {
        const oldVal =
          child.oldValue != null ? formatValue(child.oldValue) : "—";
        const newVal =
          child.newValue != null ? formatValue(child.newValue) : "—";
        const changed = child.changeType !== "unchanged";

        return (
          <div
            key={child.key}
            className="grid grid-cols-[200px_1fr_1fr] type-secondary border-t border-border/30"
          >
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8">
              {humanizeIdentifier(child.key)}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border",
                changed && child.changeType !== "added"
                  ? "bg-destructive/10 text-destructive bg-destructive/15"
                  : "text-foreground/80",
                child.changeType === "added" ? "text-muted-foreground/50" : "",
              )}
            >
              {oldVal}
            </div>
            <div
              className={cn(
                "px-3 py-1.5",
                changed && child.changeType !== "removed"
                  ? "bg-success/10 text-success bg-success/15"
                  : "text-foreground/80",
                child.changeType === "removed"
                  ? "text-muted-foreground/50"
                  : "",
              )}
            >
              {newVal}
            </div>
          </div>
        );
      })}
    </>
  );
}

export const SettingsAdapter: FieldAdapter = {
  label: "Settings",
  icon: Settings,
  renderDiff: SettingsDiffRenderer,
  toSummaryText: (node) => {
    if (node.children) {
      const changed = filterChanges(node.children);
      if (changed.length === 1) {
        const c = changed[0];
        return `${c.key}: ${formatValue(c.oldValue)} → ${formatValue(c.newValue)}`;
      }
      return `${changed.length} setting${changed.length !== 1 ? "s" : ""} changed`;
    }
    return "Settings changed";
  },
};
