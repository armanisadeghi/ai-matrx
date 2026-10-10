"use client";

// features/unified-data/map/DataHomeMapBar.tsx — LANE TABLE-MAP
//
// The list's two narrowing controls, kept on the Map: the organization filter and "Show platform
// tables". Same address word and same synced preference as the list, so switching view never loses them.

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const ALL = "all";

export interface DataHomeMapBarProps {
  organizations: ReadonlyArray<{ id: string; name: string }>;
  /** The organization the filter names, or null for all of them. */
  organizationId: string | null;
  onOrganization: (id: string | null) => void;
  showPlatformTables: boolean;
  onShowPlatformTables: (on: boolean) => void;
}

export function DataHomeMapBar({ organizations, organizationId, onOrganization, showPlatformTables, onShowPlatformTables }: DataHomeMapBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-4 border-b border-border px-3" data-table-map-bar="">
      <Select value={organizationId ?? ALL} onValueChange={(v) => onOrganization(v === ALL ? null : v)}>
        <SelectTrigger className="h-8 w-56 text-sm" aria-label="Organization">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All organizations</SelectItem>
          {organizations.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Switch id="map-platform-tables" checked={showPlatformTables} onCheckedChange={onShowPlatformTables} />
        <Label htmlFor="map-platform-tables" className="text-sm">
          Show platform tables
        </Label>
      </div>
    </div>
  );
}
