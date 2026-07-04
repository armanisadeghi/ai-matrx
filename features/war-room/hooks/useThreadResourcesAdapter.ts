// features/war-room/hooks/useThreadResourcesAdapter.ts
//
// The war-room write adapter for the canonical <AssociationList> — threads
// (and rooms) have their own edge semantics that the generic scopes-level
// writes would break: single-active demotion (task/project/note/
// studio_session), gallery position, and the `assignmentsByContainer` Redux
// bucket. So the shared list reads the bucket and writes through the war-room
// thunks; the UI stays byte-identical with the org/scope surfaces.
//
// Token boundary: the shared components speak CANONICAL registry tokens
// (`file`, `udt_document`); the war-room bucket keeps its legacy `user_file`
// alias. The mapping lives here (entityToSource / sourceToEntity), nowhere
// else.

"use client";

import { useEffect, useState } from "react";
import type { Json } from "@/types/database.types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { ContainerResourcesAdapter } from "@/features/scopes/components/associations/AssociationList";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import {
  entityToSource,
  sourceToEntity,
} from "../service/associations";
import {
  selectAssignmentsForContainer,
} from "../redux/selectors";
import {
  attachEntityToContainer,
  detachEntityFromContainer,
  loadContainerAssignments,
} from "../redux/thunks";
import {
  roomRef,
  threadRef,
  type ContainerRef,
  type WarRoomAssignment,
} from "../types";

function isPlainObject(v: unknown): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rowFromAssignment(a: WarRoomAssignment) {
  const md = isPlainObject(a.metadata) ? a.metadata : {};
  const origin = md.origin === "anchor" ? "anchor" : "thread";
  return {
    key: a.id,
    token: entityToSource(a.entity_type),
    resourceId: a.entity_id,
    label: a.label,
    pinned: md.pinned === true,
    removable: origin !== "anchor",
    originNote: origin === "anchor" ? "via anchor" : null,
  };
}

function useContainerResourcesAdapter(
  ref: ContainerRef | null,
): ContainerResourcesAdapter {
  const dispatch = useAppDispatch();
  const assignments = useAppSelector(
    selectAssignmentsForContainer(ref?.type ?? "thread", ref?.id ?? null),
  );
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    if (!ref) return;
    setLoading(true);
    try {
      await dispatch(loadContainerAssignments(ref));
    } finally {
      setLoading(false);
    }
  };

  // Hydrate on mount — idempotent (room load also seeds the buckets), covers a
  // thread/room panel opened in isolation.
  useEffect(() => {
    if (ref) {
      void dispatch(loadContainerAssignments({ type: ref.type, id: ref.id }));
    }
  }, [dispatch, ref?.type, ref?.id]);

  return {
    status: loading ? "loading" : "ready",
    error: null,
    reload,
    rows: ref ? assignments.map(rowFromAssignment) : [],
    attach: async (token: EntityTypeToken, resourceId: string, title?: string) => {
      if (!ref) return { ok: false, error: "Missing container" };
      const ok = await dispatch(
        attachEntityToContainer(ref, sourceToEntity(token), resourceId, {
          label: title ?? null,
          // Attaching a knowledge store is an explicit "use this" — pinned
          // rows stay inline in the agent context at every tier.
          metadata: token === "data_store" ? { pinned: true } : null,
        }),
      );
      return { ok };
    },
    detach: async (token: EntityTypeToken, resourceId: string) => {
      if (!ref) return { ok: false, error: "Missing container" };
      const entityType = sourceToEntity(token);
      const row = assignments.find(
        (a) => a.entity_type === entityType && a.entity_id === resourceId,
      );
      if (!row) return { ok: false, error: "Not attached" };
      const ok = await dispatch(detachEntityFromContainer(ref, row));
      return { ok };
    },
    setPinned: async (
      token: EntityTypeToken,
      resourceId: string,
      pinned: boolean,
    ) => {
      if (!ref) return { ok: false, error: "Missing container" };
      const entityType = sourceToEntity(token);
      const row = assignments.find(
        (a) => a.entity_type === entityType && a.entity_id === resourceId,
      );
      if (!row) return { ok: false, error: "Not attached" };
      const ok = await dispatch(
        attachEntityToContainer(ref, entityType, resourceId, {
          label: row.label,
          makeActive: row.is_active ?? undefined,
          metadata: { ...edgeMetadata(row), pinned },
        }),
      );
      return { ok };
    },
  };
}

/**
 * The row's REAL edge metadata, minus the synthetic keys the hydration mapper
 * adds (origin/anchor/via) — `assoc_add` overwrites metadata on conflict, so a
 * pin toggle must write back only genuine edge fields.
 */
function edgeMetadata(a: WarRoomAssignment): Record<string, Json> {
  if (!isPlainObject(a.metadata)) return {};
  const {
    origin: _origin,
    anchor_type: _anchorType,
    anchor_id: _anchorId,
    via: _via,
    is_active: _isActive,
    position: _position,
    ...rest
  } = a.metadata;
  return rest;
}

/** Adapter for one thread's resources. */
export function useThreadResourcesAdapter(
  threadId: string | null,
): ContainerResourcesAdapter {
  return useContainerResourcesAdapter(threadId ? threadRef(threadId) : null);
}

/** Adapter for room-level resources. */
export function useRoomResourcesAdapter(
  roomId: string | null,
): ContainerResourcesAdapter {
  return useContainerResourcesAdapter(roomId ? roomRef(roomId) : null);
}
