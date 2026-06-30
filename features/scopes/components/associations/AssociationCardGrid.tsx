// features/scopes/components/associations/AssociationCardGrid.tsx
//
// THE canonical "everything attached to this container" surface. Drop it under
// a PrimaryEntityProvider and it renders one AssociationCard per cardable entity
// token — fully registry-driven, ZERO per-page hardcoding:
//
//   <PrimaryEntityProvider value={{ type: "organization", id, orgId, label }}>
//     <AssociationCardGrid />
//   </PrimaryEntityProvider>
//
// By default it lists EVERY token the registry can list candidates for (the
// `listableTokens()` set, in registry declaration order which is already
// grouped utilities → sources → outputs → workspaces). Pass `tokens` to scope a
// surface to a subset. Every card shares ONE association fetch for the container
// (the cache dedupes), so the whole grid is a single round-trip.
//
// This is the org/scope/project resource grid — it replaces the old per-surface,
// permissions-driven count grids that hand-listed entity kinds and drifted.

"use client";

import { AssociationCard } from "@/features/scopes/components/associations/AssociationCard";
import { listableTokens } from "@/features/scopes/registry/entityRegistry";
import { cn } from "@/utils/cn";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface AssociationCardGridProps {
  /** Tokens to show. Defaults to every registry-listable token. */
  tokens?: EntityTypeToken[];
  className?: string;
}

export function AssociationCardGrid({
  tokens,
  className,
}: AssociationCardGridProps) {
  const list = tokens ?? listableTokens();
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {list.map((token) => (
        <AssociationCard key={token} token={token} />
      ))}
    </div>
  );
}

export default AssociationCardGrid;
