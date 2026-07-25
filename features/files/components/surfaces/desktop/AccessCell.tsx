"use client";

// features/files/components/surfaces/desktop/AccessCell.tsx
//
// The Access column cell. Its only job beyond <AccessBadge> is to feed the
// badge the container signal, so a row that is reachable through a scope stops
// claiming "only you".
//
// Scope ids come from the shared row-scope store, primed by FileTable with ONE
// bulk query per visible page (the same store the Context column reads). This
// cell never fetches on its own — the full, honest computation is
// `entity_access_summary`, and that runs one entity at a time in the info panel.

import { useSyncExternalStore } from "react";
import {
  subscribeRowScopes,
  getRowScopes,
} from "@/features/scopes/components/context-assignment/data";
import { AccessBadge } from "@/features/files/components/surfaces/desktop/AccessBadge";
import { SharedAvatarStack } from "@/features/files/components/surfaces/desktop/SharedAvatarStack";
import type { Visibility } from "@/features/files/types";

export interface AccessCellProps {
  entityType: "file" | "folder";
  entityId: string;
  visibility: Visibility;
  memberCount: number;
  isShared: boolean;
  granteeIds: string[];
}

export function AccessCell({
  entityType,
  entityId,
  visibility,
  memberCount,
  isShared,
  granteeIds,
}: AccessCellProps) {
  const scopeIds = useSyncExternalStore(
    subscribeRowScopes,
    () => getRowScopes(entityType, entityId),
    () => undefined,
  );

  return (
    <div className="flex items-center gap-2">
      {isShared && granteeIds.length > 0 ? (
        <SharedAvatarStack granteeIds={granteeIds} max={2} size="sm" />
      ) : null}
      <AccessBadge
        visibility={visibility}
        memberCount={memberCount}
        scopeCount={scopeIds?.length}
      />
    </div>
  );
}

export default AccessCell;
