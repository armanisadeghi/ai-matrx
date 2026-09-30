"use client";

// features/hr/shared/HrLaneTabs.tsx
//
// HR's lane row, in the shell's own words and its own tab bar (`EntityScopeTabs`): an HR list
// never coins a lane name ("Everyone", "Organization", "HR queue"). Each HR surface maps the keys
// its door understands onto the fixed vocabulary — everyone in the employer is All, the employer's
// own people are My Orgs — and a work queue is a FILTER beside the tabs, never a lane.
// No counts: the HR doors return page totals, not per-lane totals, so a tab shows no number
// rather than a number nobody measured.

import {
  EntityScopeTabs,
} from "@/lib/entity-list/components/EntityScopeTabs";
import { EMPTY_SCOPE_COUNTS } from "@/lib/entity-list/types";
import { makeScope, type ListScopeKind } from "@/lib/list-scope/types";

export interface HrLaneTabsProps {
  /** The lanes this HR list offers, in the shell's order. */
  lanes: readonly ListScopeKind[];
  /** The lane in force; null when a filter (a work queue) overrides them, so none reads as active. */
  active: ListScopeKind | null;
  onChange: (lane: ListScopeKind) => void;
}

export function HrLaneTabs({ lanes, active, onChange }: HrLaneTabsProps) {
  return (
    <EntityScopeTabs
      // A kind outside `lanes` highlights no tab.
      scope={makeScope(active ?? "platform_all")}
      scopes={[...lanes]}
      exact
      counts={EMPTY_SCOPE_COUNTS}
      countsLoading
      onChange={(next) => onChange(next.kind)}
    />
  );
}
