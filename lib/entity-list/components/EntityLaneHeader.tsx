"use client";

// lib/entity-list/components/EntityLaneHeader.tsx
//
// The canonical list header for a lane-reader list outside <EntityListPage>, in one row:
//
//   All | Mine | My team | My Orgs | Shared | Public          [ All organizations v ]
//
// Presentation only, over the shared lane primitives: the lane from `useLaneParam`, the filter from
// `useOrgFilterParam`, the counts from `laneCounts` over `useLaneRows` (the same rows the list
// shows, so a count never disagrees with it). A host renders it directly above its rows, never
// inside an existing toolbar. A failed lane read shows no numbers and a retry, never a 0.

import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  makeScope,
  withStandardLanes,
  type LaneSupport,
  type ListScopeKind,
} from "@/lib/list-scope/types";
import { laneCounts } from "../laneRows";
import type { LaneRowsState } from "../useLaneRows";
import { EntityOrgFilter } from "./EntityOrgFilter";
import { EntityScopeTabs } from "./EntityScopeTabs";
import { Button } from "@ai-matrx/design-system/controls";

export interface EntityLaneHeaderProps {
  /** The lanes the surface declares (All and My team are added by withStandardLanes). */
  scopes: readonly ListScopeKind[];
  /** Lanes the type can never hold (`{ public: false }`). */
  laneSupport?: LaneSupport;
  lane: ListScopeKind;
  onLaneChange: (lane: ListScopeKind) => void;
  orgId: string | null;
  onOrgChange: (orgId: string | null) => void;
  laneRows: LaneRowsState;
  /** A narrow host (a sidebar): the lanes are one select at every width. */
  compact?: boolean;
  className?: string;
}

export function EntityLaneHeader({
  scopes,
  laneSupport,
  lane,
  onLaneChange,
  orgId,
  onOrgChange,
  laneRows,
  compact = false,
  className,
}: EntityLaneHeaderProps) {
  const offered = withStandardLanes(scopes, { lanes: laneSupport });
  const counts = laneCounts(laneRows.rows ?? [], offered, orgId);
  const unmeasured = laneRows.rows === null;
  return (
    <div
      data-entity-lane-header=""
      className={cn("flex min-w-0 items-center justify-between gap-2", className)}
    >
      <div className="flex min-w-0 items-center gap-1">
        <EntityScopeTabs
          scope={makeScope(lane)}
          scopes={[...scopes]}
          lanes={laneSupport}
          counts={counts}
          countsLoading={unmeasured}
          compact={compact}
          onChange={(next) => onLaneChange(next.kind)}
        />
        {laneRows.error !== null && (
          <Button variant="quiet" icon={<RotateCw />} onClick={laneRows.reload} aria-label="Retry counts" title="Counts failed to load. Retry." className="shrink-0" />
        )}
      </div>
      <EntityOrgFilter
        orgId={orgId}
        onChange={onOrgChange}
        counts={counts}
        countsLoading={unmeasured}
      />
    </div>
  );
}
