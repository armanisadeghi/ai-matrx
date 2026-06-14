"use client";

// features/war-room/components/shared/WarRoomContextPicker.tsx
//
// Controlled org + scope picker for War Room. Composes the canonical
// EntityTargetPicker (organization) + EntityScopeTagger (controlled scopes).
// Reports the selection via onChange and writes NOTHING to appContextSlice
// (global active context) or ctx_scope_assignments — the caller persists the
// value onto its own ctx_war_room_* record. See features/scopes/FEATURE.md.

import { EntityTargetPicker } from "@/features/scopes/components/entity-context/EntityTargetPicker";
import { EntityScopeTagger } from "@/features/scopes/components/entity-context/EntityScopeTagger";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";

export interface WarRoomContextSelection {
  organizationId: string | null;
  scopeIds: string[];
}

export function WarRoomContextPicker({
  value,
  onChange,
  className,
}: {
  value: WarRoomContextSelection;
  onChange: (next: WarRoomContextSelection) => void;
  className?: string;
}) {
  // Hydrate the org/scope tree so the pickers have data.
  useScopeTree();

  return (
    <div className={className}>
      <EntityTargetPicker
        kind="organization"
        value={value.organizationId}
        onSelect={(id) =>
          onChange({
            organizationId: id,
            // Scopes belong to an org — clear them when the org changes.
            scopeIds: id === value.organizationId ? value.scopeIds : [],
          })
        }
        label="Organization"
        emptyText="No organization"
      />
      {value.organizationId ? (
        <div className="mt-2">
          <EntityScopeTagger
            value={value.scopeIds}
            onChange={(next) => onChange({ ...value, scopeIds: next })}
            organizationId={value.organizationId}
            variant="sidebar"
            showHeader={false}
            allowMultiPerType
          />
        </div>
      ) : null}
    </div>
  );
}
