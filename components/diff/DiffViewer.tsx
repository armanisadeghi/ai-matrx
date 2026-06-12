"use client";

// components/diff/DiffViewer.tsx
//
// THE canonical, headless diff core. One component, both engines:
//   - engine="light"  -> TextDiff   (custom, word-level, plain text / markdown)
//   - engine="monaco" -> CodeDiff   (Monaco DiffEditor, code)
//   - engine="auto"   -> picks Monaco for recognized code languages or very
//                        large inputs, TextDiff otherwise.
//
// It is wrapper-free on purpose: render it as a route, inside a WindowPanel,
// a modal, a sheet, a sidebar, or any region of a page. All product surfaces
// should import THIS, not the engine internals.

import { TextDiff, type TextDiffView } from "./text/TextDiff";
import { CodeDiff } from "./code/CodeDiff";
import type { TextDiffOptions } from "./text/engine/types";

export type DiffEngine = "auto" | "light" | "monaco";

export interface DiffViewerProps {
  original: string;
  modified: string;
  /** Force an engine; default "auto". */
  engine?: DiffEngine;
  /** Monaco language id (e.g. "typescript"). Drives auto engine selection. */
  language?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  view?: "split" | "inline";
  defaultView?: "split" | "inline";
  showToolbar?: boolean;
  showLineNumbers?: boolean;
  wrap?: boolean;
  readOnly?: boolean;
  /** Light-engine word/char diff options. */
  textOptions?: TextDiffOptions;
  className?: string;
}

/** Languages that should render in the light text engine even under "auto". */
const TEXT_LANGUAGES = new Set([
  "",
  "plaintext",
  "text",
  "txt",
  "markdown",
  "md",
  "mdx",
]);

/** Heuristic threshold: very large inputs go to Monaco for virtualization. */
const LARGE_INPUT_CHARS = 60_000;

function resolveEngine(
  engine: DiffEngine,
  language: string | undefined,
  original: string,
  modified: string,
): "light" | "monaco" {
  if (engine !== "auto") return engine;
  const lang = (language ?? "").toLowerCase();
  if (lang && !TEXT_LANGUAGES.has(lang)) return "monaco";
  if (original.length + modified.length > LARGE_INPUT_CHARS) return "monaco";
  return "light";
}

export function DiffViewer({
  original,
  modified,
  engine = "auto",
  language,
  originalLabel,
  modifiedLabel,
  view,
  defaultView = "split",
  showToolbar = true,
  showLineNumbers = true,
  wrap,
  readOnly = true,
  textOptions,
  className,
}: DiffViewerProps) {
  const resolved = resolveEngine(engine, language, original, modified);

  if (resolved === "monaco") {
    return (
      <CodeDiff
        original={original}
        modified={modified}
        language={language}
        originalLabel={originalLabel}
        modifiedLabel={modifiedLabel}
        view={view ?? defaultView}
        readOnly={readOnly}
        wordWrap={wrap}
        showLabels={showToolbar}
        className={className}
      />
    );
  }

  return (
    <TextDiff
      original={original}
      modified={modified}
      originalLabel={originalLabel}
      modifiedLabel={modifiedLabel}
      view={view as TextDiffView | undefined}
      defaultView={defaultView}
      showToolbar={showToolbar}
      showLineNumbers={showLineNumbers}
      wrap={wrap}
      diffOptions={textOptions}
      className={className}
    />
  );
}

export default DiffViewer;
