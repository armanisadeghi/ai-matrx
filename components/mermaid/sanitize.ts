/**
 * The forgiving ladder — progressive auto-repair of LLM-generated mermaid.
 *
 * Contract:
 *  - Pure and mermaid-free: the validator is injected, so this module is unit
 *    testable and never drags the engine into a bundle.
 *  - The ORIGINAL source is never destroyed — callers render the fixed source
 *    but copy/export the original. Fixes are reported, not silent.
 *  - Recovery SCREAMS (console.warn) — a fixer firing means an agent emitted
 *    broken syntax, which is a real upstream defect we want visible.
 *  - Streaming mode runs only the lossless Stage A normalizers: partial text
 *    is EXPECTED to fail validation, so heavy per-rule work is skipped and the
 *    caller keeps its last-good render.
 */

import {
  detectDiagramType,
  splitFrontmatter,
  type MermaidDiagramType,
} from "./diagram-type";

export interface MermaidFix {
  rule: string;
  detail: string;
}

export interface LadderResult {
  /** The source that validated (fixed), or the best-effort source if invalid. */
  source: string;
  valid: boolean;
  fixes: MermaidFix[];
  /** The engine's parse error message when invalid after all fixers. */
  error?: string;
}

export type MermaidValidator = (
  source: string,
) => Promise<{ ok: boolean; error?: string }>;

/**
 * Turn an engine error into something a human can act on. Mermaid (and the
 * libraries under it) sometimes throw raw JS runtime errors — most notoriously
 * a `Converting circular structure to JSON … __reactFiber …` TypeError that
 * carries a live DOM node — instead of a parse message. Those say nothing
 * useful to the reader, so we replace them with a clear line. The raw text is
 * still logged at the call site for debugging.
 */
export function humanizeMermaidError(raw?: string): string | undefined {
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  const isInternalNoise =
    lower.includes("circular structure") ||
    lower.includes("__reactfiber") ||
    lower.includes("htmlhtmlelement") ||
    lower.includes("statenode") ||
    lower.includes("converting circular");
  if (isInternalNoise) {
    return "The diagram could not be parsed — the syntax is invalid.";
  }
  // Collapse multi-line stack dumps to the first, most relevant line.
  const firstLine = raw.split("\n")[0]?.trim();
  return firstLine && firstLine.length > 0 ? firstLine : raw;
}

// ─── Stage A — lossless normalizers (near-zero false-positive risk) ─────────

type Normalizer = {
  rule: string;
  detail: string;
  apply: (s: string) => string;
};

const NORMALIZERS: Normalizer[] = [
  {
    rule: "strip-wrapping-fence",
    detail: "Removed a stray ```mermaid fence wrapped around the diagram body",
    apply: (s) => {
      const m = /^\s*```(?:mermaid|mmd)?\s*\n([\s\S]*?)\n?\s*```\s*$/.exec(s);
      return m ? m[1] : s;
    },
  },
  {
    rule: "normalize-whitespace",
    detail: "Normalized line endings and removed BOM/zero-width characters",
    apply: (s) =>
      s
        .replace(/\r\n?/g, "\n")
        .replace(/[​‌‍﻿]/g, "")
        .replace(/^\n+/, ""),
  },
  {
    rule: "replace-smart-quotes",
    detail: "Replaced smart quotes with straight quotes",
    apply: (s) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
  },
  {
    rule: "convert-newline-escapes",
    detail:
      "Converted literal \\n line-break escapes to <br/> (mermaid uses <br/>, not \\n)",
    // The #1 LLM mistake: emitting a literal backslash-n (two chars) for a
    // line break inside a label. Mermaid's parser rejects it; the line break
    // token is <br/>. Real source newlines are 0x0A bytes and are untouched —
    // this only rewrites the two-char escape sequences `\n` and `\r\n`.
    apply: (s) => s.replace(/\\(?:r\\)?n/g, "<br/>"),
  },
  {
    rule: "decode-arrow-entities",
    detail: "Decoded HTML-escaped arrows (--&gt; → -->)",
    apply: (s) =>
      s
        .replace(/--&gt;/g, "-->")
        .replace(/-&gt;&gt;/g, "->>")
        .replace(/&gt;/g, ">"),
  },
  {
    rule: "normalize-arrow-dashes",
    detail: "Replaced en/em dashes inside arrows with ASCII hyphens (—> → -->)",
    // Only touches a dash-run that ENDS in `>` or BEGINS after `<`, so the
    // arrow's shape is preserved across every diagram type — an em-dash in a
    // label (no adjacent `>`/`<`) is never touched. Fixes editor/keyboard
    // autocorrect turning `-->` into `—>`.
    apply: (s) =>
      s
        .replace(/[-–—=.]*[–—][-–—=.]*>/g, (run) => run.replace(/[–—]/g, "-"))
        .replace(/<[-–—=.]*[–—][-–—=.]*/g, (run) => run.replace(/[–—]/g, "-")),
  },
];

// ─── Stage B — targeted fixers, gated per diagram type ──────────────────────

interface Fixer {
  rule: string;
  detail: string;
  appliesTo: (type: MermaidDiagramType) => boolean;
  apply: (source: string) => string;
}

const FLOWCHART_ONLY = (t: MermaidDiagramType) => t === "flowchart";
const ANY = () => true;

/** Apply a transform to body lines only, preserving frontmatter verbatim. */
function mapBodyLines(source: string, fn: (line: string) => string): string {
  const { bodyStartIndex, lines } = splitFrontmatter(source);
  const out = lines.map((line, i) => (i < bodyStartIndex ? line : fn(line)));
  return out.join("\n");
}

const FIXERS: Fixer[] = [
  {
    rule: "header-own-line",
    detail: "Moved the diagram header onto its own line",
    appliesTo: FLOWCHART_ONLY,
    apply: (s) =>
      mapBodyLines(s, (line) => {
        const m = /^(\s*)(flowchart|graph)\s+(TB|TD|LR|RL|BT)\s+(\S.*)$/.exec(
          line,
        );
        return m ? `${m[1]}${m[2]} ${m[3]}\n${m[1]}  ${m[4]}` : line;
      }),
  },
  {
    rule: "fix-comment-syntax",
    detail: "Converted // and # comment lines to %% comments",
    appliesTo: ANY,
    apply: (s) =>
      mapBodyLines(s, (line) =>
        line.replace(/^(\s*)(\/\/|#)(?!#)\s?/, "$1%% "),
      ),
  },
  {
    rule: "strip-list-bullets",
    detail: "Removed markdown list bullets the model added before statements",
    appliesTo: ANY,
    apply: (s) =>
      mapBodyLines(s, (line) => line.replace(/^(\s*)[-*]\s+(?=\w)/, "$1")),
  },
  {
    rule: "fix-arrow-typos",
    detail: "Repaired arrow syntax (-> and => become -->)",
    appliesTo: FLOWCHART_ONLY,
    apply: (s) =>
      mapBodyLines(s, (line) =>
        line
          .replace(/(\s)=>(\s)/g, "$1-->$2")
          .replace(/([^-<>])->([^>])/g, "$1-->$2"),
      ),
  },
  {
    rule: "quote-unsafe-labels",
    detail: "Quoted node labels containing special characters",
    appliesTo: FLOWCHART_ONLY,
    apply: (s) =>
      mapBodyLines(s, (line) => {
        // Quote a label only when it carries a character that confuses the
        // flowchart grammar. The original source is preserved for copy/export;
        // this only affects what renders.
        const UNSAFE = /[(){}\[\]:;#&|]/;
        const wrap = (label: string) =>
          `"${label.trim().replace(/"/g, "#quot;")}"`;
        // Multi-char shapes FIRST (longest delimiters win) so we never mistake
        // a stadium `([` for a plain `[`, etc. The inner class forbids the
        // shape's own closer so we stop at the right boundary.
        let out = line
          // stadium ([label])
          .replace(
            /([A-Za-z0-9_]+)\(\[(?!")([^\]]*)\]\)/g,
            (m, id: string, label: string) =>
              UNSAFE.test(label) ? `${id}([${wrap(label)}])` : m,
          )
          // cylinder/database [(label)]
          .replace(
            /([A-Za-z0-9_]+)\[\((?!")([^)]*)\)\]/g,
            (m, id: string, label: string) =>
              UNSAFE.test(label) ? `${id}[(${wrap(label)})]` : m,
          )
          // subroutine [[label]]
          .replace(
            /([A-Za-z0-9_]+)\[\[(?!")([^\]]*)\]\]/g,
            (m, id: string, label: string) =>
              UNSAFE.test(label) ? `${id}[[${wrap(label)}]]` : m,
          )
          // hexagon {{label}}
          .replace(
            /([A-Za-z0-9_]+)\{\{(?!")([^}]*)\}\}/g,
            (m, id: string, label: string) =>
              UNSAFE.test(label) ? `${id}{{${wrap(label)}}}` : m,
          );
        // Single-char shapes LAST. The `(?!\[|\()` / `(?!\{)` guards skip the
        // multi-char shapes already handled above so a node's shape is never
        // changed. A `[]` label may legally contain parens — the most common
        // LLM mistake (`A[Validate (strict) mode]`).
        out = out
          .replace(
            /([A-Za-z0-9_]+)\[(?!\[)(?!\()(?!")([^\]]*[(){}:;#&][^\]]*)\]/g,
            (_m, id: string, label: string) => `${id}[${wrap(label)}]`,
          )
          .replace(
            /([A-Za-z0-9_]+)\{(?!\{)(?!")([^}]*[()[\]:;#&][^}]*)\}/g,
            (_m, id: string, label: string) => `${id}{${wrap(label)}}`,
          );
        return out;
      }),
  },
  {
    rule: "fix-reserved-end",
    detail:
      'Renamed reserved node id "end" (lowercase "end" breaks flowcharts)',
    appliesTo: FLOWCHART_ONLY,
    apply: (s) =>
      mapBodyLines(s, (line) => {
        // Never touch subgraph terminators (a bare `end` line).
        if (/^\s*end\s*$/.test(line)) return line;
        return line
          .replace(/(^|\s|>)end(\[|\(|\{)/g, "$1end_node$2")
          .replace(/(^|\s|>)end($|\s)/g, "$1end_node$2");
      }),
  },
  {
    rule: "strip-markdown-emphasis",
    detail: "Removed **bold** / __underline__ markers inside labels",
    appliesTo: ANY,
    apply: (s) =>
      mapBodyLines(s, (line) =>
        line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1"),
      ),
  },
  {
    rule: "remove-trailing-commas",
    detail: "Removed trailing commas after data values",
    appliesTo: (t) => t === "pie" || t === "xychart",
    apply: (s) => mapBodyLines(s, (line) => line.replace(/,\s*$/, "")),
  },
  {
    rule: "balance-subgraph-end",
    detail: "Appended missing `end` for an unclosed subgraph",
    appliesTo: FLOWCHART_ONLY,
    apply: (s) => {
      const opens = (s.match(/^\s*subgraph\b/gm) || []).length;
      const ends = (s.match(/^\s*end\s*$/gm) || []).length;
      if (opens > ends) return s + "\nend".repeat(opens - ends);
      return s;
    },
  },
  {
    rule: "escape-inner-quotes",
    detail: "Escaped quote characters inside quoted labels",
    appliesTo: FLOWCHART_ONLY,
    apply: (s) =>
      mapBodyLines(s, (line) =>
        line.replace(
          /([[({])"(.*)"([\])}])/g,
          (full, open: string, inner: string, close: string) =>
            inner.includes('"')
              ? `${open}"${inner.replace(/"/g, "#quot;")}"${close}`
              : full,
        ),
      ),
  },
];

function scream(fixes: MermaidFix[], originalLength: number): void {
  // CLAUDE.md: recovery layers SCREAM. A fixer firing means an agent emitted
  // invalid mermaid that we silently would have eaten — make it visible.
  console.warn(
    `[MermaidSanitize] RECOVERED an invalid diagram (${originalLength} chars) via ${fixes.length} fix(es): ` +
      fixes.map((f) => f.rule).join(" → "),
    fixes,
  );
}

/**
 * Run the ladder: raw → Stage A normalizers → per-rule Stage B fixers,
 * validating cumulatively, until the source parses or every rule is spent.
 */
export async function parseWithLadder(
  raw: string,
  validate: MermaidValidator,
  opts: { streaming: boolean },
): Promise<LadderResult> {
  const first = await validate(raw);
  if (first.ok) return { source: raw, valid: true, fixes: [] };

  const fixes: MermaidFix[] = [];
  let current = raw;

  // Stage A — apply all normalizers as a batch (lossless, cheap).
  for (const n of NORMALIZERS) {
    const next = n.apply(current);
    if (next !== current) {
      fixes.push({ rule: n.rule, detail: n.detail });
      current = next;
    }
  }
  if (fixes.length > 0) {
    const check = await validate(current);
    if (check.ok) {
      if (!opts.streaming) scream(fixes, raw.length);
      return { source: current, valid: true, fixes };
    }
  }

  // Partial text is expected to fail mid-stream — keep last-good, stay quiet.
  if (opts.streaming) {
    return { source: current, valid: false, fixes };
  }

  // Stage B — targeted fixers, cumulative, validated after each firing rule.
  const diagramType = detectDiagramType(current);
  let lastError = first.error;
  for (const fixer of FIXERS) {
    if (!fixer.appliesTo(diagramType)) continue;
    const next = fixer.apply(current);
    if (next === current) continue;
    fixes.push({ rule: fixer.rule, detail: fixer.detail });
    current = next;
    const check = await validate(current);
    if (check.ok) {
      scream(fixes, raw.length);
      return { source: current, valid: true, fixes };
    }
    lastError = check.error ?? lastError;
  }

  return {
    source: current,
    valid: false,
    fixes,
    error: lastError ?? "Mermaid could not parse this diagram",
  };
}
