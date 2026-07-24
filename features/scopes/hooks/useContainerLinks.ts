// features/scopes/hooks/useContainerLinks.ts
//
// The READ + WRITE hook for a CONTAINER's associations, from the container's
// point of view ("what is attached to this org / scope / project?").
//
// Direction (canonical, consistent with scope-tagging): the resource is the
// edge SOURCE and the container is the edge TARGET — `task → organization`,
// `file → scope`. So a container's attached resources are its INCOMING edges.
//
// It normally reads through `useAssociations({ type: containerType,
// id: containerId })` (shared Redux cache). Conversation file attachments use
// the viewer-aware `conversation_files` RPC instead: the generic association
// reader is org-filtered and would omit files for an explicitly shared
// cross-org conversation. Writes still use the one association chokepoint.

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { associationsService } from "@/features/scopes/service/associationsService";
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
import type { Json } from "@/types/database.types";
import { isScopesRpcErr } from "@/features/scopes/types";

export interface ContainerLink {
  /** The edge id (for keys / removal). */
  edgeId: string;
  /** The attached resource's id (the edge source). */
  resourceId: string;
  /** The attached resource's entity token (the edge source type). */
  token: string;
  /** The edge role, or null for a plain (role-less) association. */
  role: string | null;
  label: string | null;
  /** Per-edge props from `platform.associations.metadata` (e.g. representation). */
  metadata: Json;
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
  /** Total attached resources across every token (all incoming edges). */
  totalCount: number;
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
    metadata?: Json,
    options?: { replaceMetadata?: boolean },
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

  const {
    edges,
    status: genericStatus,
    error: genericError,
    reload: reloadGeneric,
  } = useAssociations({
    type: containerType,
    id: containerId,
  });

  const conversationKey =
    containerType === "conversation" && containerId
      ? `conversation:${containerId}`
      : null;
  const activeConversationKey = useRef<string | null>(conversationKey);
  const conversationGeneration = useRef(0);
  const [conversationResult, setConversationResult] = useState<{
    key: string;
    files: ContainerLink[];
    error: string | null;
    loading: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    activeConversationKey.current = conversationKey;
    conversationGeneration.current += 1;
  }, [conversationKey]);

  const loadConversationFiles = useCallback(async (): Promise<void> => {
    const key = conversationKey;
    if (!key || !containerId) return;
    // A mutation from the previous conversation may settle after navigation.
    // It must not clear or overwrite the current conversation's inventory.
    if (activeConversationKey.current !== key) return;
    const generation = ++conversationGeneration.current;
    setConversationResult((current) => ({
      key,
      files: current?.key === key ? current.files : [],
      // Keep the visible failure context while retrying so the same control
      // can disable itself and show progress instead of disappearing.
      error: current?.key === key ? current.error : null,
      loading: true,
    }));
    const result = await associationsService.listConversationFiles(containerId);
    if (
      generation !== conversationGeneration.current ||
      activeConversationKey.current !== key
    ) {
      return;
    }
    if (isScopesRpcErr(result)) {
      setConversationResult((current) => ({
        key,
        files: current?.key === key ? current.files : [],
        error: result.error.message,
        loading: false,
      }));
      return;
    }
    setConversationResult({
      key,
      files: result.data.files.map((file) => ({
        edgeId: `conversation-file:${file.fileId}`,
        resourceId: file.fileId,
        token: "file",
        role: null,
        label: file.label,
        metadata: file.metadata,
      })),
      error: null,
      loading: false,
    });
  }, [containerId, conversationKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadConversationFiles();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadConversationFiles]);

  const conversationFiles =
    conversationResult?.key === conversationKey ? conversationResult.files : [];
  const conversationFileError =
    conversationResult?.key === conversationKey ? conversationResult.error : null;
  const conversationFileStatus =
    containerType !== "conversation"
      ? "idle"
      : conversationResult?.key !== conversationKey
        ? "loading"
        : conversationResult.loading
          ? "loading"
        : conversationFileError
          ? "error"
          : "ready";

  // A container's attached resources are the edges pointing AT it (incoming).
  // Suppress the generic conversation-file copy because its org-filtered read
  // is intentionally replaced by the viewer-aware dedicated result above.
  const incomingGeneric: ContainerLink[] = edges
    .filter(
      (edge: AssociationEdge) =>
        edge.direction === "incoming" &&
        !(
          containerType === "conversation" &&
          edge.otherType === "file"
        ),
    )
    .map((edge) => ({
      edgeId: edge.id,
      resourceId: edge.otherId,
      token: edge.otherType,
      role: edge.role ?? null,
      label: edge.label ?? null,
      metadata: edge.metadata ?? {},
    }));
  const incoming =
    containerType === "conversation"
      ? [...incomingGeneric, ...conversationFiles]
      : incomingGeneric;

  const linksFor = (token: EntityTypeToken): ContainerLink[] =>
    incoming.filter((link) => link.token === token);

  const countFor = (token: EntityTypeToken): number =>
    incoming.reduce((n, link) => (link.token === token ? n + 1 : n), 0);

  const attachedIdsFor = (token: EntityTypeToken): Set<string> => {
    const set = new Set<string>();
    for (const link of incoming) {
      if (link.token === token) set.add(link.resourceId);
    }
    return set;
  };

  const attach = async (
    token: EntityTypeToken,
    resourceId: string,
    label?: string,
    metadata?: Json,
    options?: { replaceMetadata?: boolean },
  ): Promise<AssociationWriteResult> => {
    if (!containerId) return { ok: false, error: "Missing container id" };
    const result = await dispatch(
      addAssociationThunk({
        sourceType: token,
        sourceId: resourceId,
        targetType: containerType,
        targetId: containerId,
        orgId: orgId ?? undefined,
        label,
        metadata,
        replaceMetadata: options?.replaceMetadata,
      }),
    );
    if (
      result.ok &&
      containerType === "conversation" &&
      token === "file"
    ) {
      await loadConversationFiles();
    }
    return result;
  };

  const detach = async (
    token: EntityTypeToken,
    resourceId: string,
  ): Promise<AssociationWriteResult> => {
    if (!containerId) return { ok: false, error: "Missing container id" };
    const result = await dispatch(
      removeAssociationThunk({
        sourceType: token,
        sourceId: resourceId,
        targetType: containerType,
        targetId: containerId,
      }),
    );
    if (
      result.ok &&
      containerType === "conversation" &&
      token === "file"
    ) {
      await loadConversationFiles();
    }
    return result;
  };

  const reload = async (): Promise<void> => {
    await Promise.all([
      reloadGeneric(),
      containerType === "conversation"
        ? loadConversationFiles()
        : Promise.resolve(),
    ]);
  };

  const status =
    !containerId
      ? genericStatus
      : conversationFileStatus === "error"
        ? "error"
        : containerType === "conversation" &&
            (conversationFileStatus === "idle" ||
              conversationFileStatus === "loading")
          ? "loading"
          : genericStatus;
  const error = conversationFileError ?? genericError;

  return {
    status,
    error,
    reload,
    totalCount: incoming.length,
    countFor,
    attachedIdsFor,
    linksFor,
    attach,
    detach,
  };
}
