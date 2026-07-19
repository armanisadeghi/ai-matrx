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
// `curatedTokens()` set), GROUPED BY CONTENT ROLE (Utilities / Sources /
// Outputs / Sources & Outputs / Workspaces) with the same categorical accent
// colors the org resource tiles use — one visual language for "what kind of
// thing is this" across every surface. Roles and their accents come from the
// registry (`CONTENT_ROLES`), never from a per-surface copy.
//
// Pass `tokens` to scope a surface to a subset. Every card shares ONE
// association fetch for the container (the cache dedupes), so the whole grid is
// a single round-trip.
//
// This is the org/scope/project resource grid — it replaces the old per-surface,
// permissions-driven count grids that hand-listed entity kinds and drifted.

"use client";

import { AssociationCard } from "@/features/scopes/components/associations/AssociationCard";
import {
  CONTENT_ROLES,
  getEntityInfo,
  curatedTokens,
} from "@/features/scopes/registry/entityRegistry";
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
  const list = tokens ?? curatedTokens();

  return (
    <div className={cn("space-y-5", className)}>
      {CONTENT_ROLES.map((role) => {
        const inRole = list.filter(
          (token) => getEntityInfo(token).contentRole === role.id,
        );
        if (inRole.length === 0) return null;

        return (
          <section key={role.id}>
            <div className="mb-2.5 flex items-baseline gap-3 pl-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", role.accentBar)}
                />
                <h3 className="text-sm font-semibold text-foreground">
                  {role.title}
                </h3>
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {role.tagline}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {inRole.map((token) => (
                <AssociationCard key={token} token={token} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default AssociationCardGrid;
