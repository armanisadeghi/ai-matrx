// ─────────────────────────────────────────────────────────────────────────
// remarkMatrxSyntax — THE extended-syntax pass of the one markdown core.
//
// Runs after the parser extensions (remark-gfm, remark-frontmatter,
// remark-directive, remark-definition-list, remark-math) have built the tree,
// and turns their nodes — plus the constructs no extension parses — into the
// elements every rich-content level renders:
//
//   1. front matter      hidden; parsed into `file.data.matrxFrontmatter`
//   2. containers        directives + GitHub/Obsidian/MkDocs callouts (containers.ts)
//   3. definition lists  dl / dt / dd
//   4. abbreviations     `*[HTML]: Hyper Text Markup Language` → <abbr> on every use
//   5. heading ids       `## Title {#sec:intro}` → id="sec:intro"
//   6. numbering         figures, tables, labelled equations (`\label{eq:x}` → `\tag{n}`)
//   7. inline syntax     wikilinks, embeds, ==highlight==, ^sup^, ~sub~,
//                        cross-references, cross-block footnote refs (inline-syntax.ts)
//   8. CSV / TSV fences  ```csv → a sortable table element
//   9. orphan footnotes  a definition whose reference sits in another block
//                        still renders (and its reference links to it)
//
// Environment-neutral; shared by the client and server renderers through the
// preset table (markdown-core-presets.ts).
// ─────────────────────────────────────────────────────────────────────────

import { extractFrontmatter } from "./frontmatter";
import { transformContainers } from "./containers";
import { transformInline, type InlineContext, type XrefTarget } from "./inline-syntax";
import { el, rawOf, text, toText, walkParents, type MNode, type SyntaxFile } from "./mdast-helpers";

// ── 1. front matter ─────────────────────────────────────────────────────

function stripFrontmatter(tree: MNode, file: SyntaxFile | undefined): void {
  const children = tree.children ?? [];
  const first = children[0];
  if (!first || (first.type !== "yaml" && first.type !== "toml")) return;
  tree.children = children.slice(1);
  if (file) {
    const source = typeof file.value === "string" ? file.value : "";
    file.data = { ...(file.data ?? {}), matrxFrontmatter: extractFrontmatter(source) };
  }
}

// ── 3. definition lists ─────────────────────────────────────────────────

const DEFLIST_ELEMENTS: Record<string, { tag: string; className: string[] }> = {
  defList: { tag: "dl", className: ["matrx-dl", "my-3", "space-y-1"] },
  defListTerm: { tag: "dt", className: ["font-semibold", "text-foreground"] },
  defListDescription: { tag: "dd", className: ["ml-5", "mb-2", "text-foreground/90", "[&>p]:mb-1"] },
};

function tagDefinitionLists(tree: MNode): void {
  walkParents(tree, (parent) => {
    for (const child of parent.children ?? []) {
      const spec = DEFLIST_ELEMENTS[child.type];
      if (spec) child.data = { ...(child.data ?? {}), hName: spec.tag, hProperties: { className: spec.className } };
    }
  });
}

// ── 4. abbreviations ────────────────────────────────────────────────────

const ABBR_LINE = /^\*\[([^\]\n]+)\]:[ \t]*(\S[^\n]*)$/;

function collectAbbreviations(tree: MNode, file: SyntaxFile | undefined): Map<string, string> {
  const found = new Map<string, string>();
  walkParents(tree, (parent) => {
    const kept: MNode[] = [];
    let removed = false;
    for (const child of parent.children ?? []) {
      if (child.type === "paragraph") {
        const raw = rawOf(child, file) ?? toText(child);
        const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
        const parsed = lines.map((l) => ABBR_LINE.exec(l));
        if (lines.length > 0 && parsed.every(Boolean)) {
          for (const m of parsed) if (m) found.set((m[1] ?? "").trim(), (m[2] ?? "").trim());
          removed = true;
          continue;
        }
      }
      kept.push(child);
    }
    if (removed) parent.children = kept;
  });
  return found;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyAbbreviations(tree: MNode, abbrs: Map<string, string>): void {
  if (abbrs.size === 0) return;
  const keys = [...abbrs.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const re = new RegExp(`(?<![\\w])(${keys.join("|")})(?![\\w])`, "g");
  const visit = (node: MNode) => {
    if (!node.children || node.type === "link" || node.type === "inlineCode" || node.data?.hName === "abbr") return;
    const next: MNode[] = [];
    let changed = false;
    for (const child of node.children) {
      if (child.type !== "text") {
        visit(child);
        next.push(child);
        continue;
      }
      const value = child.value ?? "";
      let pos = 0;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(value)) !== null) {
        if (m.index > pos) next.push(text(value.slice(pos, m.index)));
        next.push(el("abbr", { title: abbrs.get(m[1] ?? ""), className: ["cursor-help", "underline", "decoration-dotted", "underline-offset-2"] }, [text(m[1] ?? "")]));
        pos = m.index + m[0].length;
        changed = true;
      }
      if (pos === 0) next.push(child);
      else if (pos < value.length) next.push(text(value.slice(pos)));
    }
    if (changed) node.children = next;
  };
  visit(tree);
}

// ── 5. heading ids ──────────────────────────────────────────────────────

const HEADING_ID = /[ \t]*\{#([\w:.-]+)\}[ \t]*$/;

function applyHeadingIds(tree: MNode): void {
  walkParents(tree, (parent) => {
    for (const child of parent.children ?? []) {
      if (child.type !== "heading") continue;
      const last = child.children?.[child.children.length - 1];
      if (!last || last.type !== "text") continue;
      const m = HEADING_ID.exec(last.value ?? "");
      if (!m) continue;
      last.value = (last.value ?? "").slice(0, m.index);
      child.data = {
        ...(child.data ?? {}),
        hProperties: { ...((child.data?.hProperties as Record<string, unknown>) ?? {}), id: m[1] },
      };
    }
  });
}

// ── 6. numbering: figures, tables, equations, sections ─────────────────

/**
 * Rewrite a math node's TeX. mdast-util-math copies the value into
 * `data.hChildren` at parse time (that copy is what KaTeX renders), so both
 * change together.
 */
function setMathValue(node: MNode, value: string): void {
  const previous = node.value;
  node.value = value;
  const patch = (list: unknown[] | undefined) => {
    for (const child of list ?? []) {
      const c = child as { type?: string; value?: string; children?: unknown[] };
      if (c.type === "text" && c.value === previous) c.value = value;
      patch(c.children);
    }
  };
  patch(node.data?.hChildren);
}

const LABEL_RE = /\\label\{([^{}]+)\}/g;
const TAG_RE = /\\tag\*?\{([^{}]*)\}/;

interface FigureMeta {
  kind: "fig" | "tbl";
  caption: MNode[];
  id: string | null;
}

function numberTargets(tree: MNode): Map<string, XrefTarget> {
  const xrefs = new Map<string, XrefTarget>();
  let figures = 0;
  let tables = 0;
  let equations = 0;

  const visit = (parent: MNode) => {
    const children = parent.children;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as MNode;
      const meta = child.matrxFigure as FigureMeta | undefined;
      if (meta) {
        const n = meta.kind === "fig" ? ++figures : ++tables;
        const word = meta.kind === "fig" ? "Figure" : "Table";
        const display = `${word} ${n}`;
        if (meta.id) xrefs.set(meta.id, { kind: meta.kind, display });
        const hp = (child.data?.hProperties ?? {}) as Record<string, unknown>;
        child.data = { ...(child.data ?? {}), hProperties: { ...hp, dataXrefLabel: display } };
        const caption = el(
          "figcaption",
          { className: ["mt-1.5", "text-center", "text-sm", "text-muted-foreground"] },
          [el("span", { className: ["font-semibold", "text-foreground"] }, [text(`${display}.`)]), ...(meta.caption.length > 0 ? [text(" "), ...meta.caption] : [])],
        );
        const body = child.children ?? [];
        // A table's caption sits above it; a figure's below.
        child.children = meta.kind === "tbl" ? [caption, ...body] : [...body, caption];
        delete child.matrxFigure;
      }
      if (child.type === "heading") {
        const id = (child.data?.hProperties as Record<string, unknown> | undefined)?.id;
        if (typeof id === "string" && id.startsWith("sec:")) {
          xrefs.set(id, { kind: "sec", display: toText(child).trim() });
        }
      }
      if (child.type === "math" && typeof child.value === "string" && child.value.includes("\\label")) {
        const labels = [...child.value.matchAll(LABEL_RE)].map((m) => (m[1] ?? "").trim());
        const explicit = TAG_RE.exec(child.value);
        let number: string;
        if (explicit) {
          number = explicit[1] ?? "";
          setMathValue(child, child.value.replace(LABEL_RE, ""));
        } else {
          number = String(++equations);
          let first = true;
          setMathValue(
            child,
            child.value.replace(LABEL_RE, () => {
              if (!first) return "";
              first = false;
              return `\\tag{${number}}`;
            }),
          );
        }
        const display = `(${number})`;
        const label = labels[0];
        if (label) {
          xrefs.set(label, { kind: "eq", display });
          // The anchor a reference scrolls to (KaTeX replaces the math node).
          children.splice(i, 0, el("span", { id: label, className: ["matrx-eq-anchor", "block", "h-0"], dataXrefLabel: `Equation ${display}` }));
          i++;
        }
      }
      visit(child);
    }
  };
  visit(tree);
  return xrefs;
}

/** `\eqref{x}` / `\ref{x}` INSIDE math → the number as text (KaTeX has no cross-refs). */
function resolveMathRefs(tree: MNode, xrefs: Map<string, XrefTarget>): void {
  const visit = (node: MNode) => {
    if ((node.type === "math" || node.type === "inlineMath") && typeof node.value === "string" && /\\(eq)?ref\{/.test(node.value)) {
      setMathValue(
        node,
        node.value.replace(/\\(eqref|ref)\{([^{}]+)\}/g, (_m, kind: string, label: string) => {
          const target = xrefs.get(label.trim());
          const shown = target ? target.display.replace(/[()]/g, "") : "??";
          return kind === "eqref" ? `\\text{(${shown})}` : `\\text{${shown}}`;
        }),
      );
    }
    node.children?.forEach(visit);
  };
  visit(tree);
}

// ── 7b. `[[toc]]` paragraphs ────────────────────────────────────────────

function applyTocMarkers(tree: MNode): void {
  walkParents(tree, (parent) => {
    const children = parent.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as MNode;
      if (child.type !== "paragraph" || child.children?.length !== 1) continue;
      const only = child.children[0];
      if (only?.type === "text" && /^\s*\[\[\s*toc\s*\]\]\s*$/i.test(only.value ?? "")) {
        children[i] = el("matrx-toc", {}, [], "matrxToc");
      }
    }
  });
}

// ── 8. CSV / TSV fences ─────────────────────────────────────────────────

function applyCsvFences(tree: MNode): void {
  walkParents(tree, (parent) => {
    const children = parent.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as MNode;
      if (child.type !== "code") continue;
      const lang = (child.lang ?? "").toLowerCase();
      if (lang !== "csv" && lang !== "tsv") continue;
      children[i] = el("matrx-csv", { dataSource: child.value ?? "", dataDelimiter: lang === "tsv" ? "tab" : "comma" }, [], "matrxCsv");
    }
  });
}

// ── 9. footnotes ────────────────────────────────────────────────────────

function footnoteIds(tree: MNode): { defined: Set<string>; referenced: Set<string> } {
  const defined = new Set<string>();
  const referenced = new Set<string>();
  const visit = (node: MNode) => {
    if (node.type === "footnoteDefinition" && node.identifier) defined.add(node.identifier.toLowerCase());
    if (node.type === "footnoteReference" && node.identifier) referenced.add(node.identifier.toLowerCase());
    node.children?.forEach(visit);
  };
  visit(tree);
  return { defined, referenced };
}

/**
 * GFM renders a footnote definition only when THIS tree references it. In a
 * document the renderer split into blocks (a code fence between the
 * reference and the note), the definition would vanish; render it here, as
 * a footnote list item the other block's reference links to.
 */
function renderOrphanDefinitions(tree: MNode, referenced: Set<string>): void {
  const orphans: MNode[] = [];
  const kept: MNode[] = [];
  for (const child of tree.children ?? []) {
    if (child.type === "footnoteDefinition" && child.identifier && !referenced.has(child.identifier.toLowerCase())) {
      orphans.push(child);
    } else {
      kept.push(child);
    }
  }
  if (orphans.length === 0) return;
  const items = orphans.map((def) => {
    const id = (def.identifier ?? "").toLowerCase();
    return el(
      "li",
      { id: `user-content-fn-${encodeURIComponent(id)}`, value: /^\d+$/.test(id) ? Number(id) : undefined, className: ["[&>p]:inline"] },
      def.children ?? [],
    );
  });
  kept.push(
    el("section", { dataFootnotes: true, className: ["footnotes", "matrx-footnotes"] }, [
      el("ol", { className: ["list-decimal", "pl-5"] }, items),
    ]),
  );
  tree.children = kept;
}

// ── 7c. a paragraph holding only an embed becomes the embed (a block) ──

function unwrapStandaloneEmbeds(tree: MNode): void {
  walkParents(tree, (parent) => {
    const children = parent.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as MNode;
      if (child.type !== "paragraph") continue;
      const meaningful = (child.children ?? []).filter((n) => !(n.type === "text" && !(n.value ?? "").trim()));
      const only = meaningful.length === 1 ? meaningful[0] : null;
      if (only?.data?.hName === "matrx-embed") children[i] = only;
    }
  });
}

// ── the plugin ──────────────────────────────────────────────────────────

export default function remarkMatrxSyntax() {
  return (tree: MNode, file: SyntaxFile) => {
    stripFrontmatter(tree, file);
    transformContainers(tree, file);
    tagDefinitionLists(tree);
    const abbrs = collectAbbreviations(tree, file);
    applyHeadingIds(tree);
    applyTocMarkers(tree);
    const xrefs = numberTargets(tree);
    resolveMathRefs(tree, xrefs);
    const { defined, referenced } = footnoteIds(tree);
    const ctx: InlineContext = { xrefs, footnotes: defined };
    transformInline(tree, ctx);
    unwrapStandaloneEmbeds(tree);
    applyAbbreviations(tree, abbrs);
    applyCsvFences(tree);
    renderOrphanDefinitions(tree, referenced);
  };
}
