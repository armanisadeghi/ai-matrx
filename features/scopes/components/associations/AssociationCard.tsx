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
// (container) entity, and a plus button that opens the picker — a NON-BLOCKING
// draggable window on desktop (drawer on mobile) with attach/detach AND a
// "+ New" create-and-associate footer. ALL logic lives in hooks/utilities —
// this is pure presentation wiring over `useContainerLinks` +
// `AssociationPicker` (files open the canonical FilesResourcePicker, never a
// plain list).

"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import {
  getContentRoleMeta,
  getEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import {
  usePrimaryEntity,
  type PrimaryEntity,
} from "@/features/scopes/components/associations/PrimaryEntityContext";
import { AssociationPicker } from "@/features/scopes/components/associations/AssociationPicker";
import { AttachedItemsSheet } from "@/features/scopes/components/associations/AttachedItemsSheet";
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
  const role = getContentRoleMeta(info.contentRole);

  const [listOpen, setListOpen] = useState(false);

  const { status, countFor, attachedIdsFor, linksFor, attach, detach } =
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

  // The count is only useful if you can find out WHICH ones. The card body
  // drills into the attached list; the "+" stays a direct shortcut to attach.
  const canDrillIn = count > 0;

  return (
    <>
      <div
        className={cn(
          "group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30 hover:bg-accent/40",
          className,
        )}
      >
        {/* role accent bar — same categorical language as the resource tiles */}
        <span
          className={cn(
            "absolute inset-x-0 top-0 h-0.5 opacity-60",
            role.accentBar,
          )}
        />

        <button
          type="button"
          disabled={!canDrillIn}
          onClick={() => setListOpen(true)}
          title={
            canDrillIn
              ? `View the ${info.labelPlural.toLowerCase()} attached to ${container.label ?? "this"}`
              : undefined
          }
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left",
            canDrillIn ? "cursor-pointer" : "cursor-default",
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              role.accentBg,
              role.accentText,
            )}
          >
            <info.Icon className="h-4 w-4" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {info.labelPlural}
            </span>
            <span className="block text-[11px] text-muted-foreground tabular-nums">
              {loading ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading…
                </span>
              ) : (
                `${count} attached`
              )}
            </span>
          </span>
        </button>

        {canAttach && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={`Attach ${info.labelPlural.toLowerCase()}`}
            className="mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Mount while open (not while canDrillIn) — detaching the last item
          must leave the surface up showing "Nothing attached yet", never
          yank the window out from under the user. */}
      {listOpen && (
        <AttachedItemsSheet
          open={listOpen}
          onOpenChange={setListOpen}
          token={token}
          containerLabel={container.label}
          links={linksFor(token)}
          onAdd={
            canAttach
              ? () => {
                  setListOpen(false);
                  setOpen(true);
                }
              : undefined
          }
          onDetach={(resourceId) => detach(token, resourceId)}
        />
      )}

      {canAttach && (
        <AssociationPicker
          open={open}
          onOpenChange={setOpen}
          token={token}
          containerLabel={container.label}
          orgId={container.orgId}
          attachedIds={attachedIdsFor(token)}
          onAttach={(resourceId, title) => attach(token, resourceId, title)}
          onDetach={(resourceId) => detach(token, resourceId)}
        />
      )}
    </>
  );
}

export default AssociationCard;
