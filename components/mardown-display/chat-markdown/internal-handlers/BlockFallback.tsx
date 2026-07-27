"use client";

import React, { Suspense, lazy } from "react";
import { MarkdownErrorBoundary } from "./MarkdownErrorBoundary";
import { RenderBlock } from "../block-registry/BlockRenderer";

// Lazy so the fallback path never pulls the code highlighter into the main
// bundle. Mirrors the registry's CodeBlock import.
const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);

/**
 * Last-resort plain-text rendering. This MUST never throw — no parsing, no
 * hooks, no providers, just the raw string in a <pre>. It is the floor of the
 * fallback ladder.
 */
const PlainTextFallback: React.FC<{ content: string }> = ({ content }) => (
  <pre className="my-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 overflow-x-auto">
    {content || "[empty block]"}
  </pre>
);

/**
 * Best-effort "this is JSON" detector + pretty-printer. Returns the
 * re-serialized (indented) JSON string when the content parses cleanly as a
 * JSON object/array, otherwise null. Never throws.
 */
function tryPrettyJson(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    /* not valid JSON — fall through */
  }
  return null;
}

/**
 * Decides the most faithful "downgraded" representation for a block whose
 * rich renderer threw:
 *   1. Valid JSON  → pretty-printed `json` code block.
 *   2. A fenced/code-ish block (json/yaml/etc.) → code block in its language.
 *   3. Anything else → a code block with no language (preserves formatting).
 */
function resolveCodeFallback(block: RenderBlock): {
  code: string;
  language: string;
} {
  const content = block.content ?? "";

  const pretty = tryPrettyJson(content);
  if (pretty !== null) {
    return { code: pretty, language: "json" };
  }

  // Structured JSON-backed block types whose content is the raw JSON string.
  // Even if it didn't parse (truncated mid-stream), `json` highlighting is the
  // most honest representation.
  if (block.language === "json" || block.language === "yaml") {
    return { code: content, language: block.language };
  }

  return { code: content, language: block.language || "" };
}

interface BlockFallbackProps {
  block: RenderBlock;
  isStreamActive?: boolean;
}

/**
 * Tiered fallback for a block whose rich renderer crashed.
 *
 * Ladder (each rung guarded by its own boundary):
 *   structured renderer (already failed, handled by the caller)
 *     → pretty JSON / code block
 *       → plain text <pre>
 *
 * This replaces the old "dump raw content in a yellow warning box" behavior so
 * a `presentation` / `quiz` / `diagram` / code block that fails to render still
 * shows readable JSON (or code) instead of an ugly crash banner.
 */
export const BlockFallback: React.FC<BlockFallbackProps> = ({
  block,
  isStreamActive,
}) => {
  const { code, language } = resolveCodeFallback(block);

  return (
    <MarkdownErrorBoundary fallback={<PlainTextFallback content={code} />}>
      <Suspense fallback={<PlainTextFallback content={code} />}>
        <CodeBlock
          code={code}
          language={language || "text"}
          fontSize={14}
          className="my-3"
          isStreamActive={isStreamActive}
        />
      </Suspense>
    </MarkdownErrorBoundary>
  );
};
