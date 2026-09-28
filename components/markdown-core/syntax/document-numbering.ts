// ─────────────────────────────────────────────────────────────────────────
// DOCUMENT-WIDE NUMBERING — one pre-pass over the WHOLE source.
//
// The renderers split a document into blocks (a fence, a table, an XML
// section each cut the prose), and every block is parsed on its own. Numbers
// counted inside a block would restart ("Figure 1" twice). So the document
// root runs this pass once over the full text and hands the result to every
// block (DocumentNumberingProvider → MarkdownCore → remarkMatrxSyntax):
//
//   figures   :::figure[Caption]{#fig:id}   → "Figure n"   (document order)
//   tables    :::table[Caption]{#tbl:id}    → "Table n"
//   equations \label{eq:id} in display math → "(n)"       (an explicit \tag keeps its text)
//   sections  ## Heading {#sec:id}           → the heading text
//   footnotes [^label]                       → "n", as GFM numbers them: only a
//             label the document DEFINES, body references first in order of
//             first reference, then references inside notes in note order;
//             an undefined `[^x]` stays text, an uncited note is dropped
//   links     [label]: url "title"            → every block resolves `[text][label]`
//             against the WHOLE document's definitions, as GFM does (a table
//             cell split from the definitions below it still shows its link;
//             verify-RC-B4 round 9, R9-4)
//
// A block looks a figure up by its id, or — unlabelled — by its caption text
// in document order, so the same figure gets the same number in any block.
// Pure, fence-aware, safe on a streaming prefix (numbers only ever append).
// ─────────────────────────────────────────────────────────────────────────

import { DirectiveContainerTracker } from "../directive-container";
import { TITLED_IMAGE_LINE } from "../image-figure";
import { collectLinkDefinitions, fenceLineKinds } from "@ai-matrx/content-ir/source";

export interface NumberedTarget {
  kind: "fig" | "tbl" | "eq" | "sec";
  /** "Figure 2", "Table 1", "(3)", or a section's heading text. */
  display: string;
}

export interface DocumentNumbering {
  /** Labelled targets by label. */
  byLabel: Map<string, NumberedTarget>;
  /** Unlabelled figures/tables by `kind|caption`, in document order (one entry per occurrence). */
  byCaption: Map<string, string[]>;
  /**
   * Footnote identifier (lower-case) → its number, exactly as GFM numbers the
   * whole document: defined labels only, body references in order of first
   * reference, then references inside the notes. A label absent here is either
   * undefined (the reference stays text) or never cited (the note is dropped).
   */
  footnotes: Map<string, number>;
  /**
   * The document's link reference definitions as canonical definition lines
   * (`[label]: <url> "title"`), "" when none — every block resolves its
   * `[text][label]` references against them (prepareCoreSource), so a block
   * split from them still shows the link GFM shows.
   */
  linkDefinitions: string;
}

const FIGURE_OPEN = /^[ \t]{0,3}:{3,}(figure|table)(?:\[((?:[^\]\\]|\\.)*)\])?(?:\{([^}]*)\})?/i;
const SECTION = /^#{1,6}[ \t]+(.*?)[ \t]*\{#(sec:[\w:.-]+)\}[ \t]*$/;
const LABEL = /\\label\{([^{}]+)\}/g;
const TAG = /\\tag\*?\{([^{}]*)\}/;

export function captionKey(kind: "fig" | "tbl", caption: string): string {
  return `${kind}|${caption.replace(/[*_`~=]/g, "").replace(/\s+/g, " ").trim().toLowerCase()}`;
}

function idFromAttrs(attrs: string | undefined): string | null {
  if (!attrs) return null;
  const hash = /(?:^|\s)#([\w:.-]+)/.exec(attrs);
  if (hash) return hash[1] ?? null;
  const id = /(?:^|\s)id=["']?([\w:.-]+)/.exec(attrs);
  return id ? (id[1] ?? null) : null;
}

/** Display-math bodies outside fences: `$$ … $$` and `\[ … \]`, in order. */
function displayMath(text: string): string[] {
  const out: string[] = [];
  const re = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1] ?? m[2] ?? "");
  return out;
}

export function computeDocumentNumbering(source: string): DocumentNumbering {
  const byLabel = new Map<string, NumberedTarget>();
  const byCaption = new Map<string, string[]>();
  const footnotes = new Map<string, number>();
  if (!source) return { byLabel, byCaption, footnotes, linkDefinitions: "" };

  // Prose only: fenced code never numbers anything (THE one code-range rule).
  const kinds = fenceLineKinds(source);
  const prose = source.split("\n").map((line, i) => (kinds[i] === "prose" ? line : ""));

  let figures = 0;
  let tables = 0;
  let insideFigure: DirectiveContainerTracker | null = null;
  const addCaption = (key: string, display: string) => {
    const list = byCaption.get(key) ?? [];
    list.push(display);
    byCaption.set(key, list);
  };
  for (const line of prose) {
    if (insideFigure) {
      if (insideFigure.consume(line)) insideFigure = null;
      continue;
    }
    // `![alt](url "Title")` alone on its line is a figure captioned by its title.
    if (TITLED_IMAGE_LINE.test(line)) {
      const title = /\s(?:"([^"\n]+)"|'([^'\n]+)')\s*\)[ \t]*$/.exec(line);
      addCaption(captionKey("fig", title?.[1] ?? title?.[2] ?? ""), `Figure ${++figures}`);
      continue;
    }
    const fig = FIGURE_OPEN.exec(line);
    if (fig) {
      insideFigure = new DirectiveContainerTracker(line);
      const kind = (fig[1] as string).toLowerCase() === "table" ? "tbl" : "fig";
      const display = kind === "fig" ? `Figure ${++figures}` : `Table ${++tables}`;
      const id = idFromAttrs(fig[3]);
      if (id) byLabel.set(id, { kind, display });
      else addCaption(captionKey(kind, fig[2] ?? ""), display);
      continue;
    }
    const sec = SECTION.exec(line);
    if (sec) byLabel.set(sec[2] as string, { kind: "sec", display: (sec[1] ?? "").trim() });
  }

  let equations = 0;
  for (const body of displayMath(prose.join("\n"))) {
    const labels = [...body.matchAll(LABEL)].map((m) => (m[1] ?? "").trim());
    if (labels.length === 0) continue;
    const tag = TAG.exec(body);
    const display = `(${tag ? (tag[1] ?? "") : String(++equations)})`;
    const first = labels[0];
    if (first) byLabel.set(first, { kind: "eq", display });
  }
  numberFootnotes(prose, footnotes);
  return { byLabel, byCaption, footnotes, linkDefinitions: linkDefinitionLines(source) };
}

const FOOTNOTE_DEF = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]?(.*)$/;
const FOOTNOTE_REF = /\[\^([^\]\s]+)\](?!:)/g;
/** A line that starts another block, so it ends a note's paragraph instead of continuing it lazily. */
const INTERRUPTS_NOTE = /^ {0,3}(?:[-+*][ \t]|\d{1,9}[.)][ \t]|>|#{1,6}(?:[ \t]|$)|```|~~~|<|\[\^[^\]\s]+\]:|(?:-[ \t]*){3,}$|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$)/;

/** The footnote references on one prose line, lower-cased; inline code spans never count. */
function footnoteRefs(line: string): string[] {
  if (!line.includes("[^")) return [];
  return [...line.replace(/`+[^`]*`+/g, "").matchAll(FOOTNOTE_REF)].map((m) => (m[1] ?? "").toLowerCase());
}

/**
 * GFM's footnote numbers for the whole document (see DocumentNumbering.footnotes).
 * A note is its definition line plus its continuation: indented lines, a blank
 * line followed by an indented paragraph, and lazy lines that start no block.
 */
function numberFootnotes(prose: readonly string[], footnotes: Map<string, number>): void {
  const notes = new Map<string, string[]>();
  const body: string[] = [];
  for (let i = 0; i < prose.length; i += 1) {
    const def = FOOTNOTE_DEF.exec(prose[i] ?? "");
    if (!def) {
      body.push(prose[i] ?? "");
      continue;
    }
    const label = (def[1] ?? "").toLowerCase();
    const lines = [def[2] ?? ""];
    let previous = prose[i] ?? "";
    let j = i + 1;
    for (; j < prose.length; j += 1) {
      const line = prose[j] ?? "";
      const indented = /^(?: {4}|\t)/.test(line);
      const lazy = line.trim() !== "" && previous.trim() !== "" && !INTERRUPTS_NOTE.test(line);
      const blankThenIndented = line.trim() === "" && /^(?: {4}|\t)\S/.test(prose[j + 1] ?? "");
      if (!indented && !lazy && !blankThenIndented) break;
      lines.push(line);
      previous = line;
    }
    if (!notes.has(label)) notes.set(label, lines);
    i = j - 1;
  }
  if (notes.size === 0) return;
  const cite = (id: string) => {
    if (notes.has(id) && !footnotes.has(id)) footnotes.set(id, footnotes.size + 1);
  };
  for (const line of body) footnoteRefs(line).forEach(cite);
  // A reference inside a note numbers after the body's (GFM's footer order);
  // a Map iterates entries added while iterating, so a chain is followed.
  for (const id of footnotes.keys()) for (const line of notes.get(id) ?? []) footnoteRefs(line).forEach(cite);
}

/**
 * Same numbers? Two numberings that assign every label, caption and footnote
 * the same display are interchangeable. The document root re-computes the
 * numbering on every edit and every stream chunk; handing every MarkdownCore
 * leaf a NEW object each time made every leaf of the document re-parse on
 * every keystroke (the markdown-tester browser crash, 2026-09-26). The
 * provider keeps the previous object whenever this says nothing changed.
 */
export function sameDocumentNumbering(a: DocumentNumbering, b: DocumentNumbering): boolean {
  if (a === b) return true;
  if (a.linkDefinitions !== b.linkDefinitions) return false;
  if (a.byLabel.size !== b.byLabel.size || a.byCaption.size !== b.byCaption.size || a.footnotes.size !== b.footnotes.size) return false;
  for (const [k, v] of a.byLabel) {
    const o = b.byLabel.get(k);
    if (!o || o.kind !== v.kind || o.display !== v.display) return false;
  }
  for (const [k, v] of a.byCaption) {
    const o = b.byCaption.get(k);
    if (!o || o.length !== v.length || o.some((d, i) => d !== v[i])) return false;
  }
  for (const [k, v] of a.footnotes) if (b.footnotes.get(k) !== v) return false;
  return true;
}

/** The document's link definitions, one canonical line each (THE link-reference rule, content-ir). */
function linkDefinitionLines(source: string): string {
  if (!source.includes("]:")) return "";
  const lines: string[] = [];
  for (const [label, def] of collectLinkDefinitions(source)) {
    const title = def.title === null ? "" : ` "${def.title.replace(/["\\]/g, "\\$&")}"`;
    lines.push(`[${label.replace(/[\[\]\\]/g, "\\$&")}]: <${def.url.replace(/[<>]/g, encodeURIComponent)}>${title}`);
  }
  return lines.join("\n");
}
