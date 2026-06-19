"use client";

import { lazy, Suspense, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";

const MonacoDiffEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.DiffEditor })),
);

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
  const mode = useAppSelector((s) => s.theme.mode);
  const oldJson = useMemo(() => JSON.stringify(oldValue, null, 2), [oldValue]);
  const newJson = useMemo(() => JSON.stringify(newValue, null, 2), [newValue]);

  return (
    <div className="h-full min-h-[400px] flex flex-col">
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
        <span>{oldLabel}</span>
        <span className="flex-1" />
        <span>{newLabel}</span>
      </div>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
          <MonacoDiffEditor
            original={oldJson}
            modified={newJson}
            language="json"
            theme={mode === "dark" ? "vs-dark" : "vs"}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: "on",
              folding: true,
              wordWrap: "on",
              automaticLayout: true,
            }}
            height="100%"
          />
        </Suspense>
      </div>
    </div>
  );
}
