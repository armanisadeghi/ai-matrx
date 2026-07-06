// features/scopes/hooks/useAssociationEntitySelect.ts
//
// Default AssociationEntitySelectAdapter for a plain platform.associations
// container: items from the container's incoming edges of one token (titles
// via the edge label / entity-title resolver), create via the generic
// registry-driven row insert + attach, rename via the generic titleColumn
// update, detach via the container-links hook.
//
// "Active" has no meaning on a bare association edge, so the caller owns it
// (controlled `activeId` + `onActiveChange`); when uncontrolled it falls back
// to the first attached entity. Surfaces with their OWN active semantics
// (war-room's is_active edge metadata) implement the adapter themselves
// instead of using this hook.

"use client";

import { useState } from "react";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import {
  createEntityRow,
  renameEntityRow,
} from "@/features/scopes/service/entityRows";
import type { AssociationEntitySelectAdapter } from "@/features/scopes/components/associations/AssociationEntitySelect";
import type { AssociationTargetType } from "@/features/scopes/types";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface UseAssociationEntitySelectAdapterArgs {
  token: EntityTypeToken;
  /** The container the entities are associated with (always the edge TARGET). */
  container: {
    type: AssociationTargetType;
    id: string | null;
    orgId?: string | null;
  };
  /** Controlled active selection; omit to default to the first attached row. */
  activeId?: string | null;
  onActiveChange?: (id: string) => void | Promise<unknown>;
  /** NOT NULL columns the registry conventions can't know (create only). */
  createColumns?: Record<string, unknown>;
}

export function useAssociationEntitySelectAdapter(
  args: UseAssociationEntitySelectAdapterArgs,
): AssociationEntitySelectAdapter {
  const { token, container, activeId, onActiveChange, createColumns } = args;
  const links = useContainerLinks({
    containerType: container.type,
    containerId: container.id,
    orgId: container.orgId,
  });
  const rows = links.linksFor(token);
  const { titleFor } = useEntityTitles(
    rows.map((r) => ({ token, id: r.resourceId, label: r.label })),
  );
  // Rename/create wins over the (attach-time) edge label until a refetch.
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(
    {},
  );
  // Uncontrolled fallback selection (used only when the caller passes no
  // activeId — a bare edge has no active flag to persist).
  const [localActiveId, setLocalActiveId] = useState<string | null>(null);

  const items = rows.map((r) => ({
    id: r.resourceId,
    title:
      titleOverrides[r.resourceId] ??
      titleFor({ token, id: r.resourceId, label: r.label }),
  }));

  const controlled = activeId !== undefined;
  const resolvedActive = controlled ? activeId : localActiveId;
  const effectiveActive =
    resolvedActive && items.some((i) => i.id === resolvedActive)
      ? resolvedActive
      : (items[0]?.id ?? null);

  const setActive = (id: string) => {
    if (!controlled) setLocalActiveId(id);
    return onActiveChange?.(id);
  };

  return {
    loading: links.status === "loading" || links.status === "idle",
    items,
    activeId: effectiveActive,
    setActive,
    createAndAttach: async (title) => {
      const created = await createEntityRow(token, {
        title,
        orgId: container.orgId,
        extraColumns: createColumns,
      });
      if (!created.ok) return null;
      const attached = await links.attach(token, created.data.id, title);
      if (!attached.ok) return null;
      setTitleOverrides((prev) => ({ ...prev, [created.data.id]: title }));
      await setActive(created.data.id);
      return created.data.id;
    },
    rename: async (id, title) => {
      const res = await renameEntityRow(token, id, title);
      if (res.ok) setTitleOverrides((prev) => ({ ...prev, [id]: title.trim() }));
      return res.ok;
    },
    detach: (id) => links.detach(token, id),
  };
}
