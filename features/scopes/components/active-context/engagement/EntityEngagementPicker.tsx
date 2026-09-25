"use client";

// features/scopes/components/active-context/engagement/EntityEngagementPicker.tsx
//
// An EngagementPicker for a RECORD that carries organization / project / task
// foreign keys and scope tags (an agent app today; any entity tomorrow). Each
// dimension persists on its own channel, exactly as the replaced
// AgentAppHierarchyCascade did (lane HIERARCHY-CASCADE, 2026-09-25):
//   - organization / project / task → the host's FK columns, through the
//     three callbacks (one write per dimension that actually changed);
//   - scope tags → `useEntityScopes().setScopes` (the canonical association
//     edge through scopesService), hydrated from the record on mount.
// A tag never trims the record's project or task: in the canonical engine a
// scope is a tag, not a filter.

import { useMemo } from "react";
import { toast } from "@/lib/toast";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import type { EntityType } from "@/features/scopes/types";
import type {
  EngagementRung,
  EngagementSelection,
} from "../quick-pick/engine";
import { EngagementPicker, type EngagementPickerProps } from "./EngagementPicker";

export interface EntityEngagementPickerProps
  extends Omit<EngagementPickerProps, "value" | "onChange"> {
  entityType: EntityType;
  entityId: string;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  onOrganizationChange: (next: string | null) => void;
  onProjectChange: (next: string | null) => void;
  onTaskChange: (next: string | null) => void;
  rungs?: readonly EngagementRung[];
}

export function EntityEngagementPicker({
  entityType,
  entityId,
  organizationId,
  projectId,
  taskId,
  onOrganizationChange,
  onProjectChange,
  onTaskChange,
  ...pickerProps
}: EntityEngagementPickerProps) {
  const { scopeIds, setScopes } = useEntityScopes({
    entityType,
    entityId,
    organizationId,
  });

  const value = useMemo<EngagementSelection>(
    () => ({
      organizationId,
      organizationName: null,
      projectId,
      projectName: null,
      taskId,
      taskName: null,
      scopeIds,
    }),
    [organizationId, projectId, taskId, scopeIds],
  );

  const onChange = (next: EngagementSelection) => {
    if (next.organizationId !== organizationId) {
      onOrganizationChange(next.organizationId);
    }
    const sameTags =
      next.scopeIds.length === scopeIds.length &&
      next.scopeIds.every((id) => scopeIds.includes(id));
    if (!sameTags) {
      // A refused tag write is said out loud — the tags revert to what is stored.
      void setScopes(next.scopeIds).then((res) => {
        if (!res.ok) {
          toast.error("Couldn't save the scope tags", {
            description: res.error ?? "The tags were not changed.",
          });
        }
      });
    }
    if (next.projectId !== projectId) onProjectChange(next.projectId);
    if (next.taskId !== taskId) onTaskChange(next.taskId);
  };

  return <EngagementPicker {...pickerProps} value={value} onChange={onChange} />;
}
