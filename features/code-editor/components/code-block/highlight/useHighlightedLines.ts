"use client";

// Highlighted lines for a (possibly still streaming) code string.
//
// Streaming: code arrives as a growing prefix. @shikijs/stream's tokenizer
// keeps the grammar state at the last COMPLETE line, so each update only
// tokenizes what arrived since — never the whole block again — and only the
// last (unstable) line is re-tokenized. A change that is not an append (an
// edit, a reset) starts a fresh tokenizer.
//
// Until the highlighter and the grammar are loaded (first block of a
// language), `lines` is null and the caller renders the plain text in the
// same layout — no flash, no layout shift.

import { useEffect, useRef, useState } from "react";
import type { ThemedToken } from "shiki/core";
import type { ShikiStreamTokenizer } from "@shikijs/stream";

export interface HighlightedToken {
  content: string;
  light?: string;
  dark?: string;
  fontStyle?: number;
}

export interface HighlightedCode {
  /** One entry per source line; null while the grammar loads. */
  lines: HighlightedToken[][] | null;
  /** Theme background colors, for the block surface. */
  background: { light: string; dark: string } | null;
  /** The exact code `lines` were tokenized from (it lags `code` by a tick). */
  source: string;
}

interface TokenizerSlot {
  tokenizer: ShikiStreamTokenizer;
  language: string;
  consumed: string;
}

function toToken(token: ThemedToken): HighlightedToken {
  const style = token.htmlStyle as Record<string, string> | undefined;
  return {
    content: token.content,
    light: style?.["--shiki-light"] ?? token.color,
    dark: style?.["--shiki-dark"] ?? token.color,
    fontStyle: token.fontStyle,
  };
}

/** Split a flat stream of tokens (with "\n" tokens) into lines. */
function splitLines(tokens: ThemedToken[]): HighlightedToken[][] {
  const lines: HighlightedToken[][] = [[]];
  for (const token of tokens) {
    if (token.content === "\n") {
      lines.push([]);
      continue;
    }
    lines[lines.length - 1].push(toToken(token));
  }
  return lines;
}

/** Lines per tokenize slice, and the main-thread budget before yielding. */
const SLICE_LINES = 40;
const SLICE_BUDGET_MS = 8;

/** The first `count` lines of `text` (with their newlines), or all of it. */
function takeLines(text: string, count: number): string {
  let index = -1;
  for (let i = 0; i < count; i += 1) {
    index = text.indexOf("\n", index + 1);
    if (index === -1) return text;
  }
  return text.slice(0, index + 1);
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Finished blocks re-mount constantly (virtualized chat lists, tab switches):
// the last tokenizations are kept so a remount never re-tokenizes.
const CACHE_LIMIT = 64;
const cache = new Map<string, HighlightedToken[][]>();

function cacheKey(language: string, code: string): string {
  return `${language}\u0000${code}`;
}

function readCache(language: string, code: string): HighlightedToken[][] | null {
  const key = cacheKey(language, code);
  const hit = cache.get(key);
  if (!hit) return null;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function writeCache(language: string, code: string, lines: HighlightedToken[][]) {
  cache.set(cacheKey(language, code), lines);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function useHighlightedLines(
  code: string,
  rawLanguage: string | undefined,
): HighlightedCode {
  const [result, setResult] = useState<HighlightedCode>({
    lines: null,
    background: null,
    source: "",
  });
  const slot = useRef<TokenizerSlot | null>(null);
  const generation = useRef(0);
  // Updates tokenize strictly in order — two overlapping runs would feed the
  // same tokenizer the same delta twice.
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const run = ++generation.current;

    const task = async () => {
      const [
        { getHighlighter, ensureLanguage, resolveShikiLanguage, SHIKI_THEME },
        { ShikiStreamTokenizer },
      ] = await Promise.all([
        import("./shiki-highlighter"),
        import("@shikijs/stream"),
      ]);
      // A newer update is already queued behind this one: let it do the work.
      if (run !== generation.current) return;
      const highlighter = await getHighlighter();
      const language = resolveShikiLanguage(rawLanguage);
      await ensureLanguage(highlighter, language);

      let current = slot.current;
      const isAppend =
        current !== null &&
        current.language === language &&
        code.startsWith(current.consumed);
      if (!current || !isAppend) {
        current = {
          tokenizer: new ShikiStreamTokenizer({
            highlighter,
            lang: language,
            themes: { light: SHIKI_THEME.light, dark: SHIKI_THEME.dark },
            defaultColor: false,
          }),
          language,
          consumed: "",
        };
        slot.current = current;
      }
      const background = {
        light: highlighter.getTheme(SHIKI_THEME.light).bg,
        dark: highlighter.getTheme(SHIKI_THEME.dark).bg,
      };
      const cached = readCache(language, code);
      if (cached && current.consumed === "") {
        setResult({ lines: cached, background, source: code });
        return;
      }

      // Time-sliced: a long block tokenizes in slices of whole lines, handing
      // the main thread back between slices, and shows each colored prefix as
      // it lands (the rest stays plain text in place). Never a long task.
      const tokenizer = current.tokenizer;
      const publish = (source: string) =>
        setResult({
          lines: splitLines([...tokenizer.tokensStable, ...tokenizer.tokensUnstable]),
          background,
          source,
        });
      let delta = code.slice(current.consumed.length);
      let sliceStart = performance.now();
      while (delta) {
        const piece = takeLines(delta, SLICE_LINES);
        await tokenizer.enqueue(piece);
        current.consumed += piece;
        delta = delta.slice(piece.length);
        if (delta && performance.now() - sliceStart > SLICE_BUDGET_MS) {
          if (run === generation.current) publish(current.consumed);
          await yieldToMain();
          if (run !== generation.current) return;
          sliceStart = performance.now();
        }
      }
      if (run !== generation.current) return;
      publish(code);
      writeCache(language, code, splitLines([
        ...tokenizer.tokensStable,
        ...tokenizer.tokensUnstable,
      ]));
    };

    queue.current = queue.current.then(task).catch((error: unknown) => {
      // Plain text stays on screen (honest, readable); say why.
      console.warn(
        `[CodeBlock] syntax highlighting unavailable for "${rawLanguage ?? "text"}" — showing plain text.`,
        error,
      );
    });
  }, [code, rawLanguage]);

  return result;
}
