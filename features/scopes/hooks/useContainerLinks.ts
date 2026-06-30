// features/scopes/hooks/useContainerLinks.ts
//
// The READ + WRITE hook for a CONTAINER's associations, from the container's
// point of view ("what is attached to this org / scope / project?").
//
// Direction (canonical, consistent with scope-tagging): the resource is the
// edge SOURCE and the container is the edge TARGET — `task → organization`,
// `file → scope`. So a container's attached resources are its INCOMING edges.
//
// It reads through `useAssociations({ type: containerType, id: containerId })`
// (shared Redux cache — every card for the same container dedupes to ONE fetch)
// and derives per-token counts/links from the incoming edges. Writes go through
// the association thunks with source=resource → target=container; those reload
// BOTH endpoints, so the container's counts refresh automatically.

"use client";

import { useAppDispatch } from "@/lib/redux/hooks";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import {
  addAssociation as addAssociationThunk,
  removeAssociation as removeAssociationThunk,
  type AssociationWriteResult,
} from "@/features/scopes/redux/thunks/associations";
import type {
  AssociationEdge,
  AssociationTargetType,
} from "@/features/scopes/types";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface ContainerLink {
  /** The edge id (for keys / removal). */
  edgeId: string;
  /** The attached resource's id (the edge source). */
  resourceId: string;
  /** The attached resource's entity token (the edge source type). */
  token: string;
  label: string | null;
}

export interface UseContainerLinksArgs {
  /** The primary entity — always an association TARGET (container). */
  containerType: AssociationTargetType;
  containerId: string | null;
  /** Org to stamp on new edges (for org-scoped RLS / counts). */
  orgId?: string | null;
}

export interface UseContainerLinksReturn {
  status: ReturnType<typeof useAssociations>["status"];
  error: string | null;
  reload: () => Promise<void>;
  /** Live count of attached resources of `token`. */
  countFor: (token: EntityTypeToken) => number;
  /** Ids of resources of `token` already attached (for picker "attached" state). */
  attachedIdsFor: (token: EntityTypeToken) => Set<string>;
  /** Full link rows of `token` (for listing/removal). */
  linksFor: (token: EntityTypeToken) => ContainerLink[];
  /** Attach a resource (source) to this container (target). */
  attach: (
    token: EntityTypeToken,
    resourceId: string,
    label?: string,
  ) => Promise<AssociationWriteResult>;
  /** Detach a resource from this container. */
  detach: (
    token: EntityTypeToken,
    resourceId: string,
  ) => Promise<AssociationWriteResult>;
}

export function useContainerLinks(
  args: UseContainerLinksArgs,
): UseContainerLinksReturn {
  const { containerType, containerId, orgId } = args;
  const dispatch = useAppDispatch();

  const { edges, status, error, reload } = useAssociations({
    type: containerType,
    id: containerId,
  });

  // A container's attached resources are the edges pointing AT it (incoming).
  const incoming: AssociationEdge[] = edges.filter(
    (e) => e.direction === "incoming",
  );

  const linksFor = (token: EntityTypeToken): ContainerLink[] =>
    incoming
      .filter((e) => e.otherType === token)
      .map((e) => ({
        edgeId: e.id,
        resourceId: e.otherId,
        token: e.otherType,
        label: e.label ?? null,
      }));

  const countFor = (token: EntityTypeToken): number =>
    incoming.reduce((n, e) => (e.otherType === token ? n + 1 : n), 0);

  const attachedIdsFor = (token: EntityTypeToken): Set<string> => {
    const set = new Set<string>();
    for (const e of incoming) if (e.otherType === token) set.add(e.otherId);
    return set;
  };

  const attach = async (
    token: EntityTypeToken,
    resourceId: string,
    label?: string,
  ): Promise<AssociationWriteResult> => {
    if (!containerId) return { ok: false, error: "Missing container id" };
    return dispatch(
      addAssociationThunk({
        sourceType: token,
        sourceId: resourceId,
        targetType: containerType,
        targetId: containerId,
        orgId: orgId ?? undefined,
        label,
      }),
    );
  };

  const detach = async (
    token: EntityTypeToken,
    resourceId: string,
  ): Promise<AssociationWriteResult> => {
    if (!containerId) return { ok: false, error: "Missing container id" };
    return dispatch(
      removeAssociationThunk({
        sourceType: token,
        sourceId: resourceId,
        targetType: containerType,
        targetId: containerId,
      }),
    );
  };

  return {
    status,
    error,
    reload,
    countFor,
    attachedIdsFor,
    linksFor,
    attach,
    detach,
  };
}
