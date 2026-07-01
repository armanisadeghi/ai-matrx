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

interface RawJsonViewProps {
  oldValue: unknown;
  newValue: unknown;
  oldLabel: string;
  newLabel: string;
}

export function RawJsonView({
  oldValue,
  newValue,
  oldLabel,
  newLabel,
}: RawJsonViewProps) {
  const mode = useThemeMode();
  const oldJson = useMemo(() => JSON.stringify(oldValue, null, 2), [oldValue]);
  const newJson = useMemo(() => JSON.stringify(newValue, null, 2), [newValue]);

  return (
    <div className="h-full min-h-[400px]">
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
  );
}
