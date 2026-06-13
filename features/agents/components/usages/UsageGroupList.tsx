/**
 * Usage rows grouped by usage_type, ordered for display, with count headers.
 */

"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { UsageScope } from "@/features/agents/redux/usages/usages.slice";
import type { AgentUsageRow, AgentUsageType } from "@/features/agents/redux/usages/usages.types";
import { USAGE_TYPE_ORDER, usageTypeMeta } from "./usageTypeMeta";
import { UsageRow } from "./UsageRow";

interface UsageGroupListProps {
  rows: AgentUsageRow[];
  scope: UsageScope;
  showOwner?: boolean;
  onNotify?: (row: AgentUsageRow) => void;
}

export function UsageGroupList({ rows, scope, showOwner, onNotify }: UsageGroupListProps) {
  const groups = useMemo(() => {
    const byType = new Map<AgentUsageType, AgentUsageRow[]>();
    for (const r of rows) {
      const arr = byType.get(r.usageType) ?? [];
      arr.push(r);
      byType.set(r.usageType, arr);
    }
    return USAGE_TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
      type: t,
      items: byType.get(t)!,
    }));
  }, [rows]);

  if (groups.length === 0) {
    return (
      <div className="px-3 py-10 text-center text-sm text-muted-foreground">
        No usages found for this agent.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {groups.map(({ type, items }) => {
        const meta = usageTypeMeta(type);
        const Icon = meta.icon;
        const redFlags = items.filter((r) => r.worstSeverity && r.worstSeverity !== "info").length;
        return (
          <section key={type}>
            <header className="flex items-center gap-2 bg-muted/40 px-3 py-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span className="text-xs font-semibold text-foreground">{meta.plural}</span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
              {redFlags > 0 && (
                <span
                  className={cn(
                    "ml-auto rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive",
                  )}
                >
                  {redFlags} flagged
                </span>
              )}
            </header>
            <div>
              {items.map((row) => (
                <UsageRow
                  key={`${row.usageType}:${row.usageId}:${row.nodeId ?? ""}`}
                  row={row}
                  scope={scope}
                  showOwner={showOwner}
                  onNotify={onNotify}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
