// features/scopes/components/associations/AssociationCard.tsx
//
// THE canonical, reusable association card. Drop it on any surface that has a
// PrimaryEntityProvider (or pass `container` explicitly) and hand it a single
// secondary-entity TOKEN:
//
//   <AssociationCard token="task" />
//
// It resolves the icon + label from the entity registry (nothing hardcoded),
// shows a LIVE count of how many of that entity are attached to the primary
// (container) entity, and a plus button that opens a picker side-sheet to
// attach/detach. ALL logic lives in hooks/utilities — this is pure presentation
// wiring over `useContainerLinks` + `AssociationPickerSheet`.

"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  usePrimaryEntity,
  type PrimaryEntity,
} from "@/features/scopes/components/associations/PrimaryEntityContext";
import { AssociationPickerSheet } from "@/features/scopes/components/associations/AssociationPickerSheet";
import { cn } from "@/utils/cn";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface AssociationCardProps {
  /** The secondary entity kind this card manages (e.g. "task", "file"). */
  token: EntityTypeToken;
  /** Override the page's primary entity. Defaults to PrimaryEntityProvider. */
  container?: PrimaryEntity;
  className?: string;
}

export function AssociationCard({
  token,
  container: containerProp,
  className,
}: AssociationCardProps) {
  const fromCtx = usePrimaryEntity();
  const container = containerProp ?? fromCtx;
  const [open, setOpen] = useState(false);

  const info = getEntityInfo(token);

  const { status, countFor, attachedIdsFor, attach, detach } =
    useContainerLinks({
      containerType: container?.type ?? "organization",
      containerId: container?.id ?? null,
      orgId: container?.orgId,
    });

  // No container in scope → render nothing rather than guess.
  if (!container) {
    console.error(
      `[AssociationCard] no primary entity for token "${token}" — wrap in <PrimaryEntityProvider> or pass a container prop`,
    );
    return null;
  }

  const count = countFor(token);
  const loading = status === "loading" || status === "idle";
  const canAttach = info.canListCandidates;

  return (
    <>
      <div
        className={cn(
          "group relative flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 transition-colors hover:bg-accent/30",
          className,
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <info.Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {info.labelPlural}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading…
              </span>
            ) : (
              `${count} attached`
            )}
          </p>
        </div>

        {canAttach && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={`Attach ${info.labelPlural.toLowerCase()}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {canAttach && (
        <AssociationPickerSheet
          open={open}
          onOpenChange={setOpen}
          token={token}
          containerLabel={container.label}
          attachedIds={attachedIdsFor(token)}
          onAttach={(resourceId, title) => attach(token, resourceId, title)}
          onDetach={(resourceId) => detach(token, resourceId)}
        />
      )}
    </>
  );
}

export default AssociationCard;
