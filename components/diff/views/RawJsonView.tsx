"use client";

// components/diff/views/RawJsonView.tsx
//
// Raw JSON side-by-side diff for the STRUCTURED diff system (DiffViewerShell).
// A thin JSON-stringify wrapper around the canonical heavy engine `CodeDiff`
// (Monaco, behind its own single `next/dynamic({ssr:false})` boundary) — no
// second Monaco wrapper of its own. (FEATURE.md A12.)

import { useMemo } from "react";
import { CodeDiff } from "@/components/diff/code/CodeDiff";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import type { DiffTemporalMetadata } from "../engine/types";
import { DiffSideMoment } from "./DiffTemporalRow";

interface RawJsonViewProps {
  oldValue: unknown;
  newValue: unknown;
  oldLabel: string;
  newLabel: string;
  temporalMetadata?: DiffTemporalMetadata;
}

export function RawJsonView({
  oldValue,
  newValue,
  oldLabel,
  newLabel,
  temporalMetadata,
}: RawJsonViewProps) {
  const mode = useThemeMode();
  const oldJson = useMemo(() => JSON.stringify(oldValue, null, 2), [oldValue]);
  const newJson = useMemo(() => JSON.stringify(newValue, null, 2), [newValue]);

  return (
    <div className="flex h-full min-h-[400px] flex-col">
      {temporalMetadata?.old || temporalMetadata?.new ? (
        <div className="grid shrink-0 grid-cols-2 border-b border-border bg-card text-xs">
          <div className="border-r border-border px-3 py-1.5">
            {temporalMetadata.old ? (
              <DiffSideMoment moment={temporalMetadata.old} />
            ) : null}
          </div>
          <div className="px-3 py-1.5">
            {temporalMetadata.new ? (
              <DiffSideMoment moment={temporalMetadata.new} />
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <CodeDiff
          original={oldJson}
          modified={newJson}
          language="json"
          originalLabel={oldLabel}
          modifiedLabel={newLabel}
          view="split"
          theme={mode === "dark" ? "dark" : "light"}
          showLabels
        />
      </div>
    </div>
  );
}
