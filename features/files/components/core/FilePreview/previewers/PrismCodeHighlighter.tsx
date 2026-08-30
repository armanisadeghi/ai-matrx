"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import type { MediaCodeHighlighterProps } from "@ai-matrx/media/viewers";
import { useThemeMode } from "@/styles/themes/useThemeMode";

export function PrismCodeHighlighter({
  code,
  language,
}: MediaCodeHighlighterProps) {
  const isDark = useThemeMode() === "dark";

  return (
    <SyntaxHighlighter
      language={language}
      style={isDark ? vscDarkPlus : vs}
      showLineNumbers
      wrapLongLines={false}
      customStyle={{
        margin: 0,
        background: "transparent",
        fontSize: "0.75rem",
        lineHeight: "1.25rem",
        padding: "0.75rem",
      }}
      codeTagProps={{
        style: { fontFamily: "var(--font-mono, monospace)" },
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
