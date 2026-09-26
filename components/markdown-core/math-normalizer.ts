// ─────────────────────────────────────────────────────────────────────────
// THE ONE MATH DIALECT for every markdown surface in AI Matrx.
//
// Every math-capable MarkdownCore preset runs `normalizeMathDelimiters` on its
// source and uses `REMARK_MATH_OPTIONS` / `REHYPE_KATEX_OPTIONS`; standalone
// renderers (the file previewer) and direct-KaTeX components import the same
// three exports. Never write a second `\(…\)` / `$…$` converter anywhere.
//
// The dialect (remark-math runs with single-dollar math OFF, so `$5` is
// always currency at the parser level; this pass decides what IS math):
//   - `\(…\)`   → inline math (`$$…$$` inside running text, no paragraph break)
//   - `\[…\]`   → display math (its own `$$` fenced block)
//   - `$…$`     → inline math ONLY when unambiguous (pandoc-style rule plus a
//                 math signal — see `isSingleDollarMath`), so "$5 and $10"
//                 stays currency while `$x^2$` / `$n$` render.
//   - `[ \frac… ]` on its own (a smaller-model display form) → display math.
//   - Fenced code, inline code spans and existing `$$…$$` math are NEVER
//     touched.
//
// Evidence (2026-09-23, live DB): ~415 chat messages and ~33 notes carry
// unfenced single-dollar LaTeX (`$x^2$`-shaped with a TeX signal) while
// ~3.5k messages / ~290 notes carry `$<digit>` currency — both are real, so
// the rule converts unambiguous math instead of disabling or enabling `$`
// wholesale.
// ─────────────────────────────────────────────────────────────────────────

import { fenceLineKinds, findCodeRanges, isSingleDollarMath } from "@ai-matrx/content-ir/source";

/** remark-math options for EVERY math-capable renderer. */
export const REMARK_MATH_OPTIONS = { singleDollarTextMath: false } as const;

/** rehype-katex options for EVERY math-capable renderer. */
export const REHYPE_KATEX_OPTIONS = {
  strict: "ignore",
  // SAFETY LIMITS — math is rendered from anyone's text (shared notes,
  // public pages), so it must not be able to inflate or script the page
  // (verifier F3, 2026-09-25; guard __tests__/katex-limits.test.tsx):
  /** No command (`\href`, `\url`, `\includegraphics`, `\htmlClass`…) is trusted. */
  trust: false,
  /** Largest size any user-given length may take, in em (`\rule{1000em}` → 10em). */
  maxSize: 10,
  /** Macro expansions per formula before KaTeX stops (a `\def` loop ends here). */
  maxExpand: 500,
} as const;

type Segment = { text: string; protected: boolean; math?: boolean };


/**
 * Split markdown into protected (code fences, code spans, `$$…$$` math) and
 * convertible text segments. Concatenating every segment reproduces the input.
 */
function segment(md: string): Segment[] {
  const out: Segment[] = [];
  let buf = "";
  const flushText = () => {
    if (buf) out.push({ text: buf, protected: false });
    buf = "";
  };
  const pushProtected = (text: string) => {
    flushText();
    out.push({ text, protected: true });
  };

  const lines = md.split(/(?<=\n)/);
  // Pass 1: fenced code blocks by line — THE one code-range rule
  // (@ai-matrx/content-ir/source), never a private fence regex.
  const kinds = fenceLineKinds(md);
  let i = 0;
  const blocks: Segment[] = [];
  let textRun = "";
  while (i < lines.length) {
    const line = lines[i]!;
    if (kinds[i] === "open") {
      let fence = line;
      i += 1;
      while (i < lines.length && (kinds[i] === "body" || kinds[i] === "close")) {
        const closes = kinds[i] === "close";
        fence += lines[i]!;
        i += 1;
        if (closes) break;
      }
      if (textRun) blocks.push({ text: textRun, protected: false });
      textRun = "";
      blocks.push({ text: fence, protected: true });
      continue;
    }
    textRun += line;
    i += 1;
  }
  if (textRun) blocks.push({ text: textRun, protected: false });

  // Pass 2: inside text blocks, protect code spans and existing $$…$$ math.
  for (const block of blocks) {
    if (block.protected) {
      pushProtected(block.text);
      continue;
    }
    const s = block.text;
    // Code spans by THE one rule (left to right, escapes honoured).
    const spans = findCodeRanges(s).filter((r) => r.kind === "span");
    let nextSpan = 0;
    let j = 0;
    while (j < s.length) {
      while (nextSpan < spans.length && spans[nextSpan]!.start < j) nextSpan += 1;
      const span = spans[nextSpan];
      if (span && span.start === j) {
        pushProtected(s.slice(span.start, span.end));
        j = span.end;
        nextSpan += 1;
        continue;
      }
      const ch = s[j]!;
      if (ch === "\\" && j + 1 < s.length) {
        buf += ch + s[j + 1];
        j += 2;
        continue;
      }
      if (ch === "`") {
        // An unpaired backtick run is literal text.
        let n = 0;
        while (s[j + n] === "`") n += 1;
        buf += s.slice(j, j + n);
        j += n;
        continue;
      }
      if (ch === "$" && s[j + 1] === "$") {
        const close = s.indexOf("$$", j + 2);
        if (close === -1) {
          buf += "$$";
          j += 2;
          continue;
        }
        flushText();
        out.push({ text: s.slice(j, close + 2), protected: true, math: true });
        j = close + 2;
        continue;
      }
      buf += ch;
      j += 1;
    }
    flushText();
  }
  return out;
}

// THE single-dollar rule lives in the content-IR kernel so the renderer and
// the source tokenizer (editor islands) can never disagree about which `$…$`
// is math. Pandoc's rule plus a math signal — see `isSingleDollarMath` there.

function convertSingleDollar(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\" && i + 1 < text.length) {
      out += ch + text[i + 1];
      i += 2;
      continue;
    }
    if (ch === "$" && text[i + 1] === "$") {
      // A `$$…$$` produced by an earlier conversion step — copy verbatim.
      const close = text.indexOf("$$", i + 2);
      const end = close === -1 ? i + 2 : close + 2;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "$") {
      let close = -1;
      for (let k = i + 1; k < text.length; k += 1) {
        const c = text[k];
        if (c === "\n") break;
        if (c === "\\") {
          k += 1;
          continue;
        }
        if (c === "$") {
          close = k;
          break;
        }
      }
      if (close !== -1 && text[close + 1] !== "$") {
        const content = text.slice(i + 1, close);
        // The rule reads the text after the closer (a glued suffix `$n$th`,
        // or the next shell variable `$USER$HOSTNAME`), not one character.
        if (isSingleDollarMath(content, text.slice(close + 1, close + 33))) {
          out += `$$${content}$$`;
          i = close + 1;
          continue;
        }
      }
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Apply `fn` only to the text OUTSIDE `$$…$$` math spans (by this step every
 * inline and display math form has been converted to `$$…$$`; code spans
 * and fences were already protected by `segment`).
 */
function outsideMath(text: string, fn: (prose: string) => string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("$$", i);
    if (open === -1) break;
    const close = text.indexOf("$$", open + 2);
    if (close === -1) break;
    out += fn(text.slice(i, open)) + text.slice(open, close + 2);
    i = close + 2;
  }
  return out + fn(text.slice(i));
}

function convertBracketDisplay(text: string): string {
  // Non-standard `[ … ]` display math some smaller models emit. Converts only
  // when it is clearly math, never inside existing math (`$\mathbb{E}[X]$`,
  // verify-RC-B7 #3), never a markdown link, and never a Windows path.
  return outsideMath(text, convertBracketDisplayInProse);
}

function convertBracketDisplayInProse(text: string): string {
  return text.replace(
    /\[[\s\n]*([\s\S]*?)[\s\n]*\](?![(\[:])/g,
    (match: string, content: string) => {
      const trimmed = content.trim();
      // Already math (a converted \\(…\\)) or a Windows path — leave it.
      if (content.includes("$") || /[A-Za-z]:\\/.test(content)) return match;
      if (/\\[A-Za-z]/.test(content) && (content.includes("\n") || content.length >= 3)) {
        return `\n\n$$\n${trimmed}\n$$\n\n`;
      }
      const multiline = match.startsWith("[\n") || match.startsWith("[ \n");
      if (multiline && trimmed.length >= 3) {
        const hasMathOperators = /[+\-=×÷*/]/.test(trimmed);
        const hasProseWords =
          /\b(note|step|example|optional|the|is|are|was|were|for|with|this|that)\b/i.test(
            trimmed,
          );
        const mathLikeRatio =
          (trimmed.match(/[0-9+\-=×÷*/()xy\s]/g) || []).length / trimmed.length;
        if (hasMathOperators && !hasProseWords && mathLikeRatio > 0.6) {
          return `\n\n$$\n${trimmed}\n$$\n\n`;
        }
      }
      return match;
    },
  );
}

/** TeX that no prose carries: a command, a superscript, a brace, a relation or `+`, a subscript on a letter. */
const BRACKET_TEX_SIGNAL = /\\[A-Za-z]+|[\^{}=<>+]|_\{|(?:^|[^A-Za-z0-9])[A-Za-z]_[A-Za-z0-9](?![A-Za-z0-9])/;

/**
 * THE escaped-bracket rule: a closed `\[ … \]` is display math only when its
 * content is real TeX and the `\[` does not index an identifier. Everything
 * else — citations `\[1\]`, dates, task boxes `- \[x\]`, `arr\[i\]`,
 * `\[bracket\]` — is CommonMark's escaped brackets, literal text
 * (verify-RC-B4 R3-2). The rule's home is `@ai-matrx/content-ir`
 * `isEscapedBracketMath` (aidream 094594d3a1, shared vectors
 * `escaped-bracket-vectors.json`); this is its exact copy until that release
 * is installed here — then import it and delete this.
 */
export function isEscapedBracketMath(content: string, before: string | undefined): boolean {
  if (!content.trim()) return false;
  if (before !== undefined && /[A-Za-z0-9_)\]]/.test(before)) return false;
  return BRACKET_TEX_SIGNAL.test(content);
}

function normalizeText(text: string): string {
  let t = text;
  // \[…\] → display block. Blank lines around it so remark-math sees a flow
  // fence; the TeX goes on its own lines (`$$x$$` alone on a line is INLINE).
  // Escaped brackets that are not TeX stay literal (isEscapedBracketMath).
  t = t.replace(
    /\\\[((?:(?!\n[ \t]*\n)[\s\S])*?)\\\]/g,
    (match: string, tex: string, offset: number, whole: string) =>
      isEscapedBracketMath(tex, offset > 0 ? whole[offset - 1] : undefined) ? `\n\n$$\n${tex.trim()}\n$$\n\n` : match,
  );
  // \(…\) → inline. With single-dollar math off, remark-math's inline form is
  // `$$…$$` inside running text — NO paragraph breaks, so a formula inside a
  // list item or sentence never splits it into a centered block.
  t = t.replace(/\\\(((?:(?!\n[ \t]*\n)[\s\S])*?)\\\)/g, (_m, tex: string) => `$$${tex.trim()}$$`);
  // Single-dollar math first, so the bracket heuristic below sees every
  // inline formula as a protected `$$…$$` span.
  t = convertSingleDollar(t);
  t = convertBracketDisplay(t);
  return t;
}

/**
 * Normalize every LLM/author math delimiter to the one form remark-math
 * (with `REMARK_MATH_OPTIONS`) parses. Idempotent on already-normalized text.
 */
export function normalizeMathDelimiters(markdown: string): string {
  if (!markdown || !/[\\$[]/.test(markdown)) return markdown;
  return segment(markdown)
    .map((s) => (s.protected ? s.text : normalizeText(s.text)))
    .join("");
}

/** Markdown source that renders `tex` as one display-math block. */
export function displayMathSource(tex: string): string {
  return `$$\n${tex.trim()}\n$$`;
}

/** One piece of normalized markdown: prose, code (fence or span), or math. */
export interface MathSpanPiece {
  kind: "text" | "code" | "math";
  /** The source bytes of this piece (for math, including the `$$` delimiters). */
  text: string;
  /** Math only: the TeX between the delimiters. */
  tex?: string;
  /** Math only: a display block (`$$` on their own lines) vs inline. */
  display?: boolean;
}

/**
 * Split markdown into prose / code / math pieces AFTER normalizing it to the
 * one dialect — the same boundaries every renderer uses, so a consumer that
 * must turn math into something else (a document exporter drawing formulas)
 * never re-derives them. Concatenating every `text` reproduces the normalized
 * source.
 */
export function splitMathSpans(markdown: string): MathSpanPiece[] {
  return segment(normalizeMathDelimiters(markdown)).map((seg) => {
    if (!seg.protected) return { kind: "text", text: seg.text };
    if (!seg.math) return { kind: "code", text: seg.text };
    const inner = seg.text.slice(2, -2);
    return {
      kind: "math",
      text: seg.text,
      tex: inner.trim(),
      display: /^[ \t]*\n/.test(inner),
    };
  });
}
