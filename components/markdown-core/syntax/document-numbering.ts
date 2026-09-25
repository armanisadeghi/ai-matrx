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
//
// A block looks a figure up by its id, or — unlabelled — by its caption text
// in document order, so the same figure gets the same number in any block.
// Pure, fence-aware, safe on a streaming prefix (numbers only ever append).
// ─────────────────────────────────────────────────────────────────────────

import { DirectiveContainerTracker } from "../directive-container";
import { TITLED_IMAGE_LINE } from "../image-figure";

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
}

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
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
  if (!source) return { byLabel, byCaption };

  // Prose only: fenced code never numbers anything.
  const prose: string[] = [];
  let fence: string | null = null;
  for (const line of source.split("\n")) {
    const f = FENCE.exec(line);
    if (f) {
      const marker = f[1] as string;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      prose.push("");
      continue;
    }
    prose.push(fence === null ? line : "");
  }

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
  return { byLabel, byCaption };
}
