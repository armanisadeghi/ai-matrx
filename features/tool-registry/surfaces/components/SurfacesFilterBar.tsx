"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

export type StatusFilter = "all" | "active" | "inactive";
export type ManifestFilter = "all" | "with_manifest" | "without_manifest";

export interface SurfacesFilterState {
  search: string;
  status: StatusFilter;
  client: string;
  manifest: ManifestFilter;
}

export const DEFAULT_FILTER_STATE: SurfacesFilterState = {
  search: "",
  status: "all",
  client: "__all__",
  manifest: "all",
};

interface Props {
  state: SurfacesFilterState;
  onChange: (patch: Partial<SurfacesFilterState>) => void;
  clientNames: string[];
}

export function SurfacesFilterBar({ state, onChange, clientNames }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card">
      <div className="relative flex-1 max-w-md min-w-[180px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={state.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search surfaces by name or description…"
          className="pl-7 h-7 text-xs"
          style={{ fontSize: "16px" }}
        />
      </div>

      <Select
        value={state.client}
        onValueChange={(v) => onChange({ client: v })}
      >
        <SelectTrigger className="h-7 w-[160px] text-xs">
          <SelectValue placeholder="Client" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All clients</SelectItem>
          {clientNames.map((c) => (
            <SelectItem key={c} value={c}>
              <span className="font-mono">{c}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={state.status}
        onValueChange={(v) => onChange({ status: v as StatusFilter })}
      >
        <SelectTrigger className="h-7 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All status</SelectItem>
          <SelectItem value="active">Active only</SelectItem>
          <SelectItem value="inactive">Inactive only</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={state.manifest}
        onValueChange={(v) => onChange({ manifest: v as ManifestFilter })}
      >
        <SelectTrigger className="h-7 w-[150px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All manifests</SelectItem>
          <SelectItem value="with_manifest">Has SurfaceValues</SelectItem>
          <SelectItem value="without_manifest">No SurfaceValues</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
