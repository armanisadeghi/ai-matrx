"use client";

import React, { useMemo } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SurfaceManifest, SurfaceValue } from "@/features/surfaces/types";

/**
 * View-only merged manifest/DB SurfaceValue list with per-row drift chips.
 * Extracted from SurfaceDetailPanel's values tab so the side panel and the
 * full-screen surface editor render the exact same view. Value definitions
 * stay code-first — this component never edits.
 */

export type ValueSyncStatus = "in_sync" | "manifest_only" | "db_only" | "diff";

interface MergedSurfaceValue {
  name: string;
  manifest: SurfaceValue | null;
  db: SurfaceValue | null;
  status: ValueSyncStatus;
}

function mergeValuesForUi(
  manifestValues: readonly SurfaceValue[] | null,
  dbValues: SurfaceValue[],
): MergedSurfaceValue[] {
  const manifestMap = new Map<string, SurfaceValue>();
  for (const v of manifestValues ?? []) manifestMap.set(v.name, v);
  const dbMap = new Map<string, SurfaceValue>();
  for (const v of dbValues) dbMap.set(v.name, v);

  const allNames = new Set<string>([...manifestMap.keys(), ...dbMap.keys()]);
  const out: MergedSurfaceValue[] = [];
  for (const name of allNames) {
    const m = manifestMap.get(name) ?? null;
    const d = dbMap.get(name) ?? null;
    let status: ValueSyncStatus;
    if (m && d) {
      const fieldsMatch =
        m.label === d.label &&
        m.description === d.description &&
        m.valueType === d.valueType &&
        m.alwaysAvailable === d.alwaysAvailable &&
        m.typicalCharCount === d.typicalCharCount &&
        (m.sortOrder ?? 1000) === (d.sortOrder ?? 1000);
      status = fieldsMatch ? "in_sync" : "diff";
    } else if (m && !d) {
      status = "manifest_only";
    } else {
      status = "db_only";
    }
    out.push({ name, manifest: m, db: d, status });
  }
  out.sort((a, b) => {
    const oa = a.manifest?.sortOrder ?? a.db?.sortOrder ?? 1000;
    const ob = b.manifest?.sortOrder ?? b.db?.sortOrder ?? 1000;
    return oa - ob || a.name.localeCompare(b.name);
  });
  return out;
}

export function ValueSyncStatusBadge({ status }: { status: ValueSyncStatus }) {
  switch (status) {
    case "in_sync":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
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

interface Props {
  /** Code manifest for the surface — undefined when none is registered. */
  manifest: SurfaceManifest | undefined;
  /** DB-synced values (`ui_surface_value`) — null while still loading. */
  dbValues: SurfaceValue[] | null;
  loading: boolean;
  error: string | null;
}

export function SurfaceValuesTable({ manifest, dbValues, loading, error }: Props) {
  const manifestValues = manifest?.values ?? null;
  const mergedValues = useMemo(
    () => mergeValuesForUi(manifestValues, dbValues ?? []),
    [manifestValues, dbValues],
  );

  return (
    <>
      {!manifest && (
        <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          No manifest registered in code. Add one at
          <code className="ml-1 font-mono">features/surfaces/manifests/</code>
          {dbValues && dbValues.length > 0 && (
            <span>
              {" "}
              {dbValues.length} stale DB row
              {dbValues.length === 1 ? "" : "s"} present — clean up via Sync
              Manifests with{" "}
              <code className="font-mono">deleteStale: true</code>.
            </span>
          )}
        </div>
      )}
      {loading && (
        <div className="text-xs text-muted-foreground">Loading…</div>
      )}
      {error && (
        <div className="text-xs text-destructive flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
      {!loading && !error && mergedValues.length > 0 && (
        <div className="rounded-md border border-border divide-y divide-border">
          {mergedValues.map((v) => {
            const display = v.manifest ?? v.db;
            if (!display) return null;
            return (
              <div key={v.name} className="px-2 py-1.5">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-foreground truncate">
                      {v.name}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {display.valueType}
                    </Badge>
                    {display.alwaysAvailable && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                      >
                        always
                      </Badge>
                    )}
                  </div>
                  <ValueSyncStatusBadge status={v.status} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {display.label}
                  {display.label && display.description && " — "}
                  {display.description}
                </p>
                <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  ~{display.typicalCharCount} chars · sort{" "}
                  {display.sortOrder ?? 1000}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !error && mergedValues.length === 0 && manifest && (
        <div className="text-xs text-muted-foreground">
          Manifest declares no values yet.
        </div>
      )}
    </>
  );
}
