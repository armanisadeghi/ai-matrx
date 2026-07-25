"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SurfaceReadinessBucket } from "@/features/surfaces/services/surfaces.service";

export type StatusFilter = "all" | "active" | "inactive";
export type ManifestFilter = "all" | "with_manifest" | "without_manifest";
export type ReadinessFilter = SurfaceReadinessBucket | "all";

export interface SurfacesFilterState {
  search: string;
  status: StatusFilter;
  client: string;
  manifest: ManifestFilter;
  /** `__all__` | `__none__` (roots) | a parent surface name */
  parent: string;
  /** Readiness bucket, driven by the rollup tiles above the filter bar. */
  readiness: ReadinessFilter;
}

export const DEFAULT_FILTER_STATE: SurfacesFilterState = {
  search: "",
  status: "all",
  client: "__all__",
  manifest: "all",
  parent: "__all__",
  readiness: "all",
};

interface Props {
  state: SurfacesFilterState;
  onChange: (patch: Partial<SurfacesFilterState>) => void;
  clientNames: string[];
  parentNames: string[];
}

function parentFilterLabel(value: string): string {
  if (value === "__all__") return "All parents";
  if (value === "__none__") return "Root surfaces (no parent)";
  return value;
}

function ParentFilterCombobox({
  value,
  parentNames,
  onChange,
}: {
  value: string;
  parentNames: string[];
  onChange: (parent: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = parentFilterLabel(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-7 w-[220px] justify-between px-2 text-xs font-normal bg-background text-foreground"
        >
          <span className="truncate font-mono">{label}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search parent surfaces…"
            className="text-xs h-9"
          />
          <CommandList className="max-h-[min(320px,50dvh)]">
            <CommandEmpty>No parent surface found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all parents"
                onSelect={() => {
                  onChange("__all__");
                  setOpen(false);
                }}
                className="text-xs"
              >
                <Check
                  className={cn(
                    "mr-2 h-3.5 w-3.5",
                    value === "__all__" ? "opacity-100" : "opacity-0",
                  )}
                />
                All parents
              </CommandItem>
              <CommandItem
                value="root surfaces no parent"
                onSelect={() => {
                  onChange("__none__");
                  setOpen(false);
                }}
                className="text-xs"
              >
                <Check
                  className={cn(
                    "mr-2 h-3.5 w-3.5",
                    value === "__none__" ? "opacity-100" : "opacity-0",
                  )}
                />
                Root surfaces (no parent)
              </CommandItem>
            </CommandGroup>
            {parentNames.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Parent surface">
                  {parentNames.map((name) => (
                    <CommandItem
                      key={name}
                      value={name}
                      onSelect={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                      className="text-xs font-mono"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5 shrink-0",
                          value === name ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SurfacesFilterBar({
  state,
  onChange,
  clientNames,
  parentNames,
}: Props) {
  const sortedParentNames = useMemo(
    () => [...parentNames].sort((a, b) => a.localeCompare(b)),
    [parentNames],
  );

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

      <ParentFilterCombobox
        value={state.parent}
        parentNames={sortedParentNames}
        onChange={(parent) => onChange({ parent })}
      />
    </div>
  );
}
