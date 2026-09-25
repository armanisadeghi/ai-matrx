"use client";

// The files previewer's code highlighter (registered into @ai-matrx/media's
// viewers) — the shared Shiki view, so a file previews with the same colors
// as a chat code block and the /code editor.

import type { MediaCodeHighlighterProps } from "@ai-matrx/media/viewers";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { ShikiCodeView } from "@/features/code-editor/components/code-block/highlight/ShikiCodeView";

export function CodeHighlighter({ code, language }: MediaCodeHighlighterProps) {
  const mode = useThemeMode() === "dark" ? "dark" : "light";
  return (
    <ShikiCodeView
      code={code}
      language={language}
      mode={mode}
      surface="transparent"
      padding={{ y: 0.75, x: 0.75 }}
      showLineNumbers
      wrapLines={false}
      fontSize={12}
    />
  );
}
