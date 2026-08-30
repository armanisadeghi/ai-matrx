"use client";

/**
 * 1. THE MANIFEST — the existing surface-values-table pattern, EXTENDED.
 *
 * What already exists (`features/surfaces/components/SurfaceValuesTable.tsx`):
 * the merged manifest↔DB value list with per-row in-sync / manifest-only /
 * stale / diff chips. Kept verbatim in spirit — same row shape, same chip
 * vocabulary, same tones.
 *
 * What is NEW: every row now says whether it is the local implementation of a
 * KNOWN VALUE (the shared middle vocabulary) or surface-only, and which layer
 * that known value lives in. That single column is what turns a surface
 * manifest into the thing a discovered job can land on.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, CircleSlash, Link2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { Panel, RuleNote } from "./preview-chrome";
import {
  KNOWN_VALUE_BY_ID,
  LAYER_META,
  PLACE_VALUES,
  type KnownValueLayer,
  type PlaceValue,
  type ValueSyncStatus,
} from "./mock-data";

/** Identical vocabulary + tones to the live `ValueSyncStatusBadge`. */
function SyncStatusBadge({ status }: { status: ValueSyncStatus }) {
  switch (status) {
    case "in_sync":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          in sync
        </Badge>
      );
    case "manifest_only":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
        >
          manifest only
        </Badge>
      );
    case "db_only":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
        >
          stale (db only)
        </Badge>
      );
    case "diff":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"
        >
          diff
        </Badge>
      );
  }
}

/** THE NEW COLUMN — known-value alignment, by identity, with its layer. */
function AlignmentBadge({ value }: { value: PlaceValue }) {
  if (value.alignment.kind === "surface_only") {
    return (
      <Badge
        variant="outline"
        className="shrink-0 gap-1 text-[10px] text-muted-foreground"
        title="Surface-only. Nothing outside this place can address it, so no discovered job can land on it."
      >
        <CircleSlash className="h-3 w-3" />
        surface-only
      </Badge>
    );
  }
  const kv = KNOWN_VALUE_BY_ID.get(value.alignment.knownValueId);
  if (!kv) return null;
  const meta = LAYER_META[kv.layer];
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 gap-1 text-[10px] font-mono", meta.className)}
      title={`Known value · ${meta.label}\nidentity ${kv.id}\nkey "${kv.key}" is a label, not the resolver`}
    >
      <Link2 className="h-3 w-3" />
      {kv.key}
    </Badge>
  );
}

function LayerLegend({
  active,
  onToggle,
}: {
  active: KnownValueLayer | "all";
  onToggle: (layer: KnownValueLayer | "all") => void;
}) {
  const layers = Object.keys(LAYER_META) as KnownValueLayer[];
  return (
    <div className="grid gap-1.5 border-b border-border bg-muted/30 px-3 py-2 sm:grid-cols-3">
      {layers.map((layer) => {
        const meta = LAYER_META[layer];
        const isActive = active === layer;
        return (
          <button
            key={layer}
            type="button"
            onClick={() => onToggle(isActive ? "all" : layer)}
            aria-pressed={isActive}
            className={cn(
              "rounded-md border px-2 py-1.5 text-left transition-colors",
              isActive
                ? cn(meta.className, "ring-1 ring-inset ring-current/30")
                : "border-border bg-card hover:bg-accent",
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold">
              <span className={cn("h-2 w-2 rounded-full", meta.dotClassName)} />
              {meta.label}
            </span>
            <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
              {meta.blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ManifestPanel({ readOnly }: { readOnly: boolean }) {
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState<KnownValueLayer | "all">("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLACE_VALUES.filter((v) => {
      if (q && !`${v.name} ${v.label} ${v.description}`.toLowerCase().includes(q))
        return false;
      if (layer === "all") return true;
      if (v.alignment.kind === "surface_only") return false;
      return KNOWN_VALUE_BY_ID.get(v.alignment.knownValueId)?.layer === layer;
    });
  }, [query, layer]);

  const knownCount = PLACE_VALUES.filter(
    (v) => v.alignment.kind === "known",
  ).length;

  return (
    <Panel
      eyebrow="1 · What this place offers"
      title="The manifest"
      count={
        <Badge variant="outline" className="text-[10px] tabular-nums">
          {PLACE_VALUES.length} values
        </Badge>
      }
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter values"
            aria-label="Filter declared values"
            className="h-7 w-40 pl-7 text-xs"
          />
        </div>
      }
    >
      <RuleNote>
        <b className="text-foreground">{knownCount} of {PLACE_VALUES.length}</b>{" "}
        declared values are this place&rsquo;s local implementation of a{" "}
        <b className="text-foreground">known value</b> — the shared middle
        vocabulary. Those are the rows a job written somewhere else can bind to.
        The rest are surface-only and reachable only by a binding that names this
        place. Identity resolves; the key is a label.
      </RuleNote>

      <LayerLegend active={layer} onToggle={setLayer} />

      <div className="divide-y divide-border">
        {rows.map((v) => (
          <div
            key={v.name}
            className={cn(
              "px-3 py-2 transition-colors hover:bg-accent/40",
              !v.supplied && "bg-muted/20",
            )}
          >
            <div className="mb-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-xs text-foreground">
                  {v.name}
                </span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {v.valueType}
                </Badge>
                {v.alwaysAvailable && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                  >
                    always
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <AlignmentBadge value={v} />
                {!readOnly && <SyncStatusBadge status={v.syncStatus} />}
              </div>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {v.label} — {v.description}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
              <span>~{v.typicalCharCount} chars</span>
              <span>·</span>
              <span>sort {v.sortOrder}</span>
              <span>·</span>
              <span
                className={
                  v.supplied
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                }
              >
                {v.supplied ? "supplied right now" : "not supplied right now"}
              </span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No declared value matches that filter.
          </p>
        )}
      </div>
    </Panel>
  );
}
