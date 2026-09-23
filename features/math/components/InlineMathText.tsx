"use client";

import MarkdownCore from "@/components/markdown-core/MarkdownCore";
import type { Components } from "react-markdown";

interface InlineMathTextProps {
  text: string | null | undefined;
  className?: string;
}

// Inline host: paragraphs and display wrappers become spans so the text sits
// inside the caller's <p>/<h4>.
const INLINE_COMPONENTS: Components = {
  p: ({ children }) => <span>{children}</span>,
  div: ({ children, className }) => <span className={className}>{children}</span>,
};

// Bare TeX some generated problems carry with no delimiters at all
// (`\frac{1}{2}`, `x^{2}`, `a_{n}`) — wrapped as inline math BEFORE the core's
// normalizer, which then applies the one platform dialect to everything.
const BARE_TEX =
  /\\(?:frac|sqrt|text|sum|prod|int|lim|infty|alpha|beta|gamma|delta|theta|pi|sigma|omega|cdot|times|div|pm|ne|le|ge|approx|equiv|subset|supset|cap|cup|in|notin|forall|exists|partial|nabla)\s*(?:\{[^}]*\})*|[a-zA-Z]\^?\{[^}]+\}|[a-zA-Z]_\{[^}]+\}/g;
const DELIMITED = /\\\(.*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$/g;

function wrapBareTex(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(DELIMITED)) {
    out += text.slice(last, m.index).replace(BARE_TEX, (tex) => `\\(${tex}\\)`);
    out += m[0];
    last = m.index + m[0].length;
  }
  return out + text.slice(last).replace(BARE_TEX, (tex) => `\\(${tex}\\)`);
}

/**
 * Mixed text with math, rendered inline through the ONE markdown core — the
 * same `\(…\)` / `\[…\]` / `$…$` rules as chat, notes and flashcards (so
 * "$5 and $10" stays currency here too).
 */
export default function InlineMathText({ text, className = "" }: InlineMathTextProps) {
  if (!text) return null;
  return (
    <span className={className}>
      <MarkdownCore preset="math" components={INLINE_COMPONENTS}>
        {wrapBareTex(text)}
      </MarkdownCore>
    </span>
  );
}
