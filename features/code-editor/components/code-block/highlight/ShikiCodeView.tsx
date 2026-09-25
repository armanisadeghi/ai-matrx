"use client";

// The read-only code surface inside CodeBlock (and the other code renderers):
// Shiki tokens, line numbers, highlighted lines (fence `{1,3-5}`), unified-diff
// line tints, wrap / no-wrap — streaming-safe (useHighlightedLines tokenizes
// only what arrived since the last update, and the not-yet-tokenized tail
// shows as plain text in place, so nothing jumps).

import React from "react";
import { cn } from "@/lib/utils";
import {
  useHighlightedLines,
  type HighlightedToken,
} from "./useHighlightedLines";

export interface ShikiCodeViewProps {
  code: string;
  /** The fence language as written (`ts`, `python`, `diff`, …). */
  language: string | undefined;
  mode: "light" | "dark";
  showLineNumbers?: boolean;
  /** Number shown on the first line (fence `showLineNumbers{10}`). */
  startLine?: number;
  wrapLines?: boolean;
  fontSize?: number;
  /** 1-based source line numbers to highlight. */
  highlightLines?: readonly number[];
  /**
   * "theme" paints the theme's own background (a standalone code surface);
   * "transparent" sits on the host's surface (compact snippets, previews).
   */
  surface?: "theme" | "transparent";
  /** Vertical/horizontal padding in rem (default 1 / 1). */
  padding?: { y: number; x: number };
  className?: string;
}

const DIFF_LANGUAGES = new Set(["diff", "patch", "udiff"]);

type DiffKind = "add" | "remove" | "hunk" | null;

function diffKind(text: string): DiffKind {
  if (text.startsWith("+++") || text.startsWith("---")) return null;
  if (text.startsWith("+")) return "add";
  if (text.startsWith("-")) return "remove";
  if (text.startsWith("@@")) return "hunk";
  return null;
}

const DIFF_CLASS: Record<Exclude<DiffKind, null>, string> = {
  add: "bg-emerald-500/15 dark:bg-emerald-400/15",
  remove: "bg-red-500/15 dark:bg-red-400/15",
  hunk: "bg-sky-500/10 dark:bg-sky-400/10",
};

function plainLines(text: string): HighlightedToken[][] {
  return text.split("\n").map((line) => (line ? [{ content: line }] : []));
}

/** Highlighted lines for the tokenized prefix + the plain, not-yet-tokenized tail. */
function mergeTail(
  lines: HighlightedToken[][],
  tail: string,
): HighlightedToken[][] {
  if (!tail) return lines;
  const merged = lines.map((line) => [...line]);
  const [first, ...rest] = tail.split("\n");
  if (first) merged[merged.length - 1].push({ content: first });
  for (const line of rest) merged.push(line ? [{ content: line }] : []);
  return merged;
}

function tokenStyle(
  token: HighlightedToken,
  mode: "light" | "dark",
): React.CSSProperties | undefined {
  const color = mode === "dark" ? token.dark : token.light;
  const style = token.fontStyle ?? 0;
  if (!color && !style) return undefined;
  return {
    color,
    fontStyle: style & 1 ? "italic" : undefined,
    fontWeight: style & 2 ? 600 : undefined,
    textDecoration: style & 4 ? "underline" : undefined,
  };
}

export function ShikiCodeView({
  code,
  language,
  mode,
  showLineNumbers = false,
  startLine = 1,
  wrapLines = true,
  fontSize = 12,
  highlightLines,
  surface = "theme",
  padding = { y: 1, x: 1 },
  className,
}: ShikiCodeViewProps) {
  const highlighted = useHighlightedLines(code, language);

  const lines =
    highlighted.lines && code.startsWith(highlighted.source)
      ? mergeTail(highlighted.lines, code.slice(highlighted.source.length))
      : plainLines(code);

  const background =
    surface === "transparent"
      ? "transparent"
      : (highlighted.background?.[mode] ?? (mode === "dark" ? "#1e1e1e" : "#ffffff"));
  const foreground =
    surface === "transparent" ? undefined : mode === "dark" ? "#d4d4d4" : "#000000";
  const highlightSet = new Set(highlightLines ?? []);
  const isDiff = DIFF_LANGUAGES.has((language ?? "").toLowerCase());
  const lastNumber = startLine + lines.length - 1;
  const gutterWidth = `${String(lastNumber).length + 1}ch`;
  const whiteSpace = wrapLines ? "pre-wrap" : "pre";

  return (
    <pre
      className={cn("m-0 font-mono leading-[1.5]", className)}
      data-language={language ?? "text"}
      style={{
        background,
        color: foreground,
        fontSize: `${fontSize}px`,
        padding: `${padding.y}rem 0`,
        overflowX: wrapLines ? "hidden" : "auto",
        maxWidth: "100%",
      }}
    >
      <code
        className={`language-${language ?? "text"} block`}
        style={{ minWidth: wrapLines ? undefined : "max-content" }}
      >
        {lines.map((tokens, index) => {
          const lineNumber = startLine + index;
          const sourceLine = index + 1;
          const text = isDiff ? tokens.map((t) => t.content).join("") : "";
          const kind = isDiff ? diffKind(text) : null;
          const marked = highlightSet.has(sourceLine);
          return (
            <span
              key={index}
              data-line={sourceLine}
              data-highlighted={marked || undefined}
              data-diff={kind ?? undefined}
              style={{ paddingInline: `${padding.x}rem` }}
              className={cn(
                "flex",
                kind && DIFF_CLASS[kind],
                marked &&
                  "bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]",
              )}
            >
              {showLineNumbers && (
                <span
                  aria-hidden="true"
                  className="shrink-0 select-none pr-4 text-right opacity-45"
                  style={{ minWidth: gutterWidth }}
                >
                  {lineNumber}
                </span>
              )}
              <span
                className="min-w-0 flex-1"
                style={{
                  whiteSpace,
                  overflowWrap: wrapLines ? "anywhere" : "normal",
                  minHeight: "1.5em",
                }}
              >
                {tokens.map((token, t) => (
                  <span key={t} style={tokenStyle(token, mode)}>
                    {token.content}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}
