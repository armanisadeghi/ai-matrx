"use client";

// features/code-editor/components/DiffView.tsx
//
// Thin, API-preserving wrapper over the canonical DiffViewer (components/diff).
// Was a hand-rolled unified diff (generateUnifiedDiff LCS + Prism-per-line) —
// now delegates to the shared engine: real syntax-highlighted Monaco diff for
// code (engine="auto"+language), the light word-level engine for plain text.
// Same props, so callers are unchanged. (FEATURE.md A4.)

import React from "react";
import { DiffViewer } from "@/components/diff/DiffViewer";

interface DiffViewProps {
  originalCode: string;
  modifiedCode: string;
  language: string;
  showLineNumbers?: boolean;
  className?: string;
}

export function DiffView({
  originalCode,
  modifiedCode,
  language,
  showLineNumbers = true,
  className,
}: DiffViewProps) {
  return (
    <DiffViewer
      original={originalCode}
      modified={modifiedCode}
      language={language}
      engine="auto"
      defaultView="inline"
      showLineNumbers={showLineNumbers}
      className={className}
    />
  );
}
