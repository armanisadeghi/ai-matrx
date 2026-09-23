"use client";

import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import { displayMathSource } from "@/components/markdown-core/math-normalizer";

interface DisplayMathProps {
  /** A pure TeX expression — no delimiters. */
  math: string | null | undefined;
  className?: string;
}

/**
 * One display-math formula, rendered through the ONE markdown core (same
 * remark-math / rehype-katex options as every chat, note and flashcard) —
 * never a direct KaTeX call with its own options.
 */
export default function DisplayMath({ math, className }: DisplayMathProps) {
  if (!math || !math.trim()) return null;
  return (
    <div className={className}>
      <MarkdownCore preset="math">{displayMathSource(math)}</MarkdownCore>
    </div>
  );
}
