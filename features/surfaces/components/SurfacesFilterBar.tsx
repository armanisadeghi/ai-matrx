"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SurfaceReadinessBucket } from "@/features/surfaces/services/surfaces.service";
import { READINESS_META } from "@/features/surfaces/components/SurfaceReadinessBadge";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";

export type StatusFilter = "all" | "active" | "inactive";
export type ManifestFilter = "all" | "with_manifest" | "without_manifest";
export type ReadinessFilter = SurfaceReadinessBucket | "all";
/** THE UI SURFACE CHECKLIST ledger filter — the dispatch queue. */
export type CheckedFilter = "all" | "never" | "stale" | "fresh";

export interface SurfacesFilterState {
  status: StatusFilter;
  client: string;
  manifest: ManifestFilter;
  /** `__all__` | `__none__` (roots) | a parent surface name */
  parent: string;
  /** Readiness bucket, driven by the rollup tiles above the filter bar. */
  readiness: ReadinessFilter;
  /** Last completed full surface check (see surface-check-ledger). */
  checked: CheckedFilter;
}

export const DEFAULT_FILTER_STATE: SurfacesFilterState = {
  status: "all",
  client: "__all__",
  manifest: "all",
  parent: "__all__",
  readiness: "all",
  checked: "all",
};

/** How many filters differ from the defaults (the phone Filters button's count). */
export function activeFilterCount(state: SurfacesFilterState): number {
  return (Object.keys(DEFAULT_FILTER_STATE) as (keyof SurfacesFilterState)[])
    .filter((k) => state[k] !== DEFAULT_FILTER_STATE[k]).length;
}

interface Props {
  state: SurfacesFilterState;
  onChange: (patch: Partial<SurfacesFilterState>) => void;
  clientNames: string[];
  parentNames: string[];
  /** Label for a parent surface key (its registry label when known). */
  parentLabel?: (name: string) => string;
  /**
   * Phone: every filter sits behind ONE Filters button (a bottom sheet), and
   * readiness joins them because the readiness toggles are not shown there.
   */
  compact?: boolean;
  onClear?: () => void;
}

function FilterSelects({
  state,
  onChange,
  clientNames,
  parentNames,
  parentLabel = getSurfaceDisplayLabel,
  stacked,
}: Props & { stacked: boolean }) {
  const w = (desktop: string) => (stacked ? "h-11 w-full text-base" : `h-7 ${desktop} text-xs`);
  const sortedParentNames = [...parentNames].sort((a, b) =>
    parentLabel(a).localeCompare(parentLabel(b)),
  );

  return (
    <>
      {stacked && (
        <Select
          value={state.readiness}
          onValueChange={(v) => onChange({ readiness: v as ReadinessFilter })}
        >
          <SelectTrigger className={w("w-[150px]")} aria-label="Readiness">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any readiness</SelectItem>
            {(Object.keys(READINESS_META) as SurfaceReadinessBucket[]).map((b) => (
              <SelectItem key={b} value={b}>
                <span className="capitalize">{READINESS_META[b].label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={state.client} onValueChange={(v) => onChange({ client: v })}>
        <SelectTrigger className={w("w-[160px]")} aria-label="Client">
          <SelectValue placeholder="Client" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All clients</SelectItem>
          {clientNames.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={state.status}
        onValueChange={(v) => onChange({ status: v as StatusFilter })}
      >
        <SelectTrigger className={w("w-[120px]")} aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All status</SelectItem>
          <SelectItem value="active">Active only</SelectItem>
          <SelectItem value="inactive">Inactive only</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={state.checked}
        onValueChange={(v) => onChange({ checked: v as CheckedFilter })}
      >
        <SelectTrigger
          className={w("w-[150px]")}
          aria-label="Last full check"
          title="When the full surface check last completed"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any check age</SelectItem>
          <SelectItem value="never">Never checked</SelectItem>
          <SelectItem value="stale">Check is stale</SelectItem>
          <SelectItem value="fresh">Recently checked</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={state.manifest}
        onValueChange={(v) => onChange({ manifest: v as ManifestFilter })}
      >
        <SelectTrigger className={w("w-[150px]")} aria-label="Code manifest">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All manifests</SelectItem>
          <SelectItem value="with_manifest">Has a code manifest</SelectItem>
          <SelectItem value="without_manifest">No code manifest</SelectItem>
        </SelectContent>
      </Select>

      <Select value={state.parent} onValueChange={(v) => onChange({ parent: v })}>
        <SelectTrigger className={w("w-[170px]")} aria-label="Parent surface">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[min(360px,60dvh)]">
          <SelectItem value="__all__">All parents</SelectItem>
          <SelectItem value="__none__">Top level (no parent)</SelectItem>
          {sortedParentNames.map((name) => (
            <SelectItem key={name} value={name} title={name}>
              {parentLabel(name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export function SurfacesFilterBar(props: Props) {
  const [open, setOpen] = useState(false);
  if (!props.compact) return <FilterSelects {...props} stacked={false} />;

  const count = activeFilterCount(props.state);
  return (
    <>
      <Button
        size="sm"
        variant={count > 0 ? "secondary" : "outline"}
        className="h-9 gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Filters, ${count} on` : "Filters"}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {count > 0 && <span className="tabular-nums">{count}</span>}
      </Button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="pb-safe max-h-[85dvh] matrx-touch-targets">
          <DrawerHeader>
            <DrawerTitle>Filters</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
            <FilterSelects {...props} stacked />
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="h-11 flex-1"
                disabled={count === 0}
                onClick={() => props.onClear?.()}
              >
                Clear
              </Button>
              <Button className="h-11 flex-1" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
