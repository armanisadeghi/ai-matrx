"use client";

import React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SurfaceManifest, SurfaceValue } from "@/features/surfaces/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
          className="text-xs border-success/40 text-success"
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Saved
        </Badge>
      );
    case "manifest_only":
      return (
        <Badge
          variant="outline"
          className="text-xs border-warning/40 text-warning"
          title="Declared in code, not saved to the database yet — Sync manifests saves it"
        >
          Not saved yet
        </Badge>
      );
    case "db_only":
      return (
        <Badge
          variant="outline"
          className="text-xs border-destructive/40 text-destructive"
          title="Saved in the database but no longer declared in code"
        >
          Left over
        </Badge>
      );
    case "diff":
      return (
        <Badge
          variant="outline"
          className="text-xs border-warning/40 text-warning"
          title="The database copy differs from the code — Sync manifests updates it"
        >
          Out of date
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
  /** Opens Sync manifests with "Delete stale rows" chosen (left-over values). */
  onCleanUp?: () => void;
}

export function SurfaceValuesTable({
  manifest,
  dbValues,
  loading,
  error,
  onCleanUp,
}: Props) {
  const manifestValues = manifest?.values ?? null;
  const mergedValues = mergeValuesForUi(manifestValues, dbValues ?? []);
  const leftOver = dbValues?.length ?? 0;

  return (
    <>
      {!manifest && (
        <div className="space-y-2 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          <p>
            No code declares the values of this surface, so agents on it get
            only the platform&apos;s standard values.
          </p>
          {leftOver > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {leftOver} value{leftOver === 1 ? " is" : "s are"} still saved
                in the database from an earlier version.
              </span>
              {onCleanUp && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={onCleanUp}
                >
                  Clean up
                </Button>
              )}
            </div>
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
          <ErrorAlchemyMenu error={error} />
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
                    <span className="text-xs font-medium text-foreground truncate">
                      {display.label || v.name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground truncate">
                      {v.name}
                    </span>
                    {display.alwaysAvailable && (
                      <Badge variant="outline" className="text-xs">
                        Always sent
                      </Badge>
                    )}
                  </div>
                  <ValueSyncStatusBadge status={v.status} />
                </div>
                {display.description && (
                  <p className="text-xs text-muted-foreground">
                    {display.description}
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  {display.valueType} · about {display.typicalCharCount}{" "}
                  characters
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !error && mergedValues.length === 0 && manifest && (
        <div className="text-xs text-muted-foreground">
          Its code manifest declares no values yet.
        </div>
      )}
    </>
  );
}
