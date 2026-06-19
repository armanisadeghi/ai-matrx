"use client";

import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import {
  filterChanges,
  formatValue,
} from "@/components/diff/engine/diff-utils";
import type {
  FieldAdapter,
  FieldDiffProps,
} from "@/components/diff/adapters/types";

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
            className="grid grid-cols-[200px_1fr_1fr] text-xs border-t border-border/30"
          >
            <div className="px-3 py-1.5 border-r border-border text-muted-foreground pl-8 font-mono">
              {child.key}
            </div>
            <div
              className={cn(
                "px-3 py-1.5 border-r border-border",
                changed && child.changeType !== "added"
                  ? "bg-red-50 text-red-700 dark:bg-red-950/15 dark:text-red-300"
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
                  ? "bg-green-50 text-green-700 dark:bg-green-950/15 dark:text-green-300"
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
