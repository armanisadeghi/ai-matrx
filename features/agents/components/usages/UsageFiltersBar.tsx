/**
 * Admin-only filter bar over fetched usage rows (client-side narrowing by
 * owner, org, severity, and usage type). The bulk-notify action lives here too
 * ("Inform all affected users").
 */

"use client";

import { useMemo } from "react";
import { Filter, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentUsageRow, DriftSeverity } from "@/features/agents/redux/usages/usages.types";
import type { AdminUsageFilters } from "@/features/agents/redux/usages/usages.selectors";
import { DRIFT_SEVERITY_META, DRIFT_SEVERITY_ORDER } from "./severity";
import { USAGE_TYPE_META, USAGE_TYPE_ORDER } from "./usageTypeMeta";

interface UsageFiltersBarProps {
  allRows: AgentUsageRow[];
  filters: AdminUsageFilters;
  onChange: (next: AdminUsageFilters) => void;
  onInformAll: () => void;
  affectedUserCount: number;
}

export function UsageFiltersBar({
  allRows,
  filters,
  onChange,
  onInformAll,
  affectedUserCount,
}: UsageFiltersBarProps) {
  const orgs = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) {
      if (r.organizationId) m.set(r.organizationId, r.organizationName ?? r.organizationId);
    }
    return Array.from(m.entries());
  }, [allRows]);

  const presentTypes = useMemo(() => {
    const set = new Set(allRows.map((r) => r.usageType));
    return USAGE_TYPE_ORDER.filter((t) => set.has(t));
  }, [allRows]);

  const set = (patch: Partial<AdminUsageFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />

      <select
        value={filters.severity ?? ""}
        onChange={(e) => set({ severity: (e.target.value || null) as DriftSeverity | null })}
        className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
      >
        <option value="">All severities</option>
        {DRIFT_SEVERITY_ORDER.map((s) => (
          <option key={s} value={s}>
            {DRIFT_SEVERITY_META[s].label}
          </option>
        ))}
      </select>

      <select
        value={filters.usageType ?? ""}
        onChange={(e) => set({ usageType: e.target.value || null })}
        className="h-7 rounded-md border border-border bg-background px-1.5 text-xs"
      >
        <option value="">All types</option>
        {presentTypes.map((t) => (
          <option key={t} value={t}>
            {USAGE_TYPE_META[t].plural}
          </option>
        ))}
      </select>

      {orgs.length > 0 && (
        <select
          value={filters.organizationId ?? ""}
          onChange={(e) => set({ organizationId: e.target.value || null })}
          className="h-7 max-w-[160px] rounded-md border border-border bg-background px-1.5 text-xs"
        >
          <option value="">All orgs</option>
          {orgs.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      )}

      {(filters.severity || filters.usageType || filters.organizationId || filters.ownerUserId) && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Clear
        </button>
      )}

      <Button
        size="sm"
        variant="outline"
        className="ml-auto h-7 gap-1.5 px-2.5 text-xs"
        onClick={onInformAll}
        disabled={affectedUserCount === 0}
        title="Send a drift notification to every affected user in the current view"
      >
        <Send className="h-3 w-3" />
        Inform all affected ({affectedUserCount})
      </Button>
    </div>
  );
}
