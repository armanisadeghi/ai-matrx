"use client";

// components/diff/code/CodeDiff.tsx
//
// Headless HEAVY diff core for code. A clean, dependency-light wrapper around
// Monaco's DiffEditor (the same engine VS Code uses). No Redux, no overlay,
// no code-editor-feature coupling — unlike features/code/editor/TabDiffView,
// which layers patch accept/reject on top. This is the reusable primitive
// that advanced surfaces (incl. TabDiffView) can build on.

import { useThemeMode } from "@/styles/themes/useThemeMode";
import dynamic from "next/dynamic";
import type { DiffOnMount } from "@monaco-editor/react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Monaco is ~2MB and browser-only. ONE `next/dynamic({ssr:false})` boundary
// (never React.lazy) keeps it off the server render and out of every bundle
// until a code/large diff actually needs it. This is the single boundary for
// Monaco on both the standalone path (DiffViewer rendered inline) and the
// overlay path (under lazyOverlay) — do NOT add another dynamic() above it.
const MonacoDiffEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full" />,
  },
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

/** Track the app's painted dark-mode class without coupling to Redux. */
function useDocumentDarkMode(): boolean {
  return useThemeMode() === "dark";
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
      </div>
    </div>
  );
}

export default CodeDiff;
