"use client";

// components/diff/code/CodeDiff.tsx
//
// Headless HEAVY diff core for code. A clean, dependency-light wrapper around
// Monaco's DiffEditor (the same engine VS Code uses). No Redux, no overlay,
// no code-editor-feature coupling — unlike features/code/editor/TabDiffView,
// which layers patch accept/reject on top. This is the reusable primitive
// that advanced surfaces (incl. TabDiffView) can build on.

import { lazy, Suspense, useEffect, useState } from "react";
import type { DiffOnMount } from "@monaco-editor/react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const MonacoDiffEditor = lazy(() =>
  import("@monaco-editor/react").then((mod) => ({ default: mod.DiffEditor })),
);

export interface CodeDiffProps {
  original: string;
  modified: string;
  language?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  /** "split" = side-by-side, "inline" = unified. Default "split". */
  view?: "split" | "inline";
  /** Force a theme; otherwise follows the <html class="dark"> state. */
  theme?: "light" | "dark";
  readOnly?: boolean;
  wordWrap?: boolean;
  showLabels?: boolean;
  /** Escape hatch for advanced consumers (view zones, per-hunk widgets…). */
  onMount?: DiffOnMount;
  className?: string;
}

/** Track the app's dark-mode class without coupling to Redux. */
function useDocumentDarkMode(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function CodeDiff({
  original,
  modified,
  language = "plaintext",
  originalLabel,
  modifiedLabel,
  view = "split",
  theme,
  readOnly = true,
  wordWrap = false,
  showLabels = false,
  onMount,
  className,
}: CodeDiffProps) {
  const docDark = useDocumentDarkMode();
  const isDark = theme ? theme === "dark" : docDark;

  return (
    <div className={cn("flex flex-col h-full min-h-0 bg-card", className)}>
      {showLabels && (originalLabel || modifiedLabel) && (
        <div className="shrink-0 flex items-center px-3 py-1 border-b border-border bg-muted/30 text-xs text-muted-foreground">
          <span className="flex-1">{originalLabel ?? "Original"}</span>
          {view === "split" && (
            <span className="flex-1">{modifiedLabel ?? "Modified"}</span>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<Skeleton className="h-full w-full" />}>
          <MonacoDiffEditor
            original={original}
            modified={modified}
            language={language}
            theme={isDark ? "vs-dark" : "vs"}
            onMount={onMount}
            height="100%"
            options={{
              renderSideBySide: view === "split",
              readOnly,
              originalEditable: false,
              renderValidationDecorations: "off",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: "on",
              wordWrap: wordWrap ? "on" : "off",
              automaticLayout: true,
              guides: { indentation: true },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

export default CodeDiff;
