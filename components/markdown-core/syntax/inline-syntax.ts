// ─────────────────────────────────────────────────────────────────────────
// INLINE SYNTAX over text nodes — one scanner, earliest match wins:
//
//   [[Page]]  [[Page|alias]]  [[note:<uuid>|alias]]   wikilink (resolved at render)
//   ![[Page]]                                          embed
//   ==text==                                           highlight
//   x^2^   H~2~O                                      superscript / subscript (Pandoc: no spaces inside)
//   @fig:id  @tbl:id  @eq:id  @sec:id  \eqref{id}  \ref{id}   cross-reference
//   [^note]  (definition rendered in another block)    footnote reference
//
// Text inside code, math, links and existing elements is never scanned (they
// are not text nodes, or the walker skips them).
// ─────────────────────────────────────────────────────────────────────────

import { KBD_CLASS, MARK_CLASS } from "./containers";
import { el, text, type MNode } from "./mdast-helpers";

/** What the numbering pass knows about each label in this document. */
export interface XrefTarget {
  kind: "fig" | "tbl" | "eq" | "sec";
  /** "Figure 2", "Table 1", "(3)", or the section's heading text. */
  display: string;
}

export interface InlineContext {
  xrefs: Map<string, XrefTarget>;
  /** Footnote identifiers DEFINED in this tree (a `[^x]` left as text is defined elsewhere). */
  footnotes: Set<string>;
}

type Rule = {
  re: RegExp;
  build: (m: RegExpExecArray, ctx: InlineContext) => MNode | null;
};

const XREF_PREFIX: Record<string, XrefTarget["kind"]> = { fig: "fig", tbl: "tbl", eq: "eq", sec: "sec" };
const XREF_WORD: Record<XrefTarget["kind"], string> = { fig: "figure", tbl: "table", eq: "equation", sec: "section" };

export function xrefNode(label: string, kindHint: XrefTarget["kind"] | null, ctx: InlineContext, style: "at" | "eqref" | "ref"): MNode {
  const target = ctx.xrefs.get(label);
  const kind = target?.kind ?? kindHint ?? "sec";
  let shown: string;
  if (target) {
    shown = style === "ref" && target.kind === "eq" ? target.display.replace(/[()]/g, "") : target.display;
  } else {
    shown = style === "at" ? `@${label}` : `(${label})`;
  }
  return el(
    "matrx-xref",
    {
      href: `#${label}`,
      dataXref: label,
      dataXrefKind: kind,
      dataXrefStyle: style,
      dataXrefResolved: target ? "true" : "false",
      title: target ? undefined : `No ${XREF_WORD[kind]} labelled "${label}" in this document`,
    },
    [text(shown)],
  );
}

function wikiTarget(inner: string): { target: string; alias: string | null } {
  // `|` splits target from alias; `\|` (escaped inside a table cell) too.
  const cut = inner.search(/\\?\|/);
  if (cut < 0) return { target: inner.trim(), alias: null };
  const sepLength = inner[cut] === "\\" ? 2 : 1;
  return { target: inner.slice(0, cut).trim(), alias: inner.slice(cut + sepLength).trim() || null };
}

const RULES: Rule[] = [
  {
    // Wikilink / embed. Target: no brackets, no newline.
    re: /(!?)\[\[([^[\]\n]+?)\]\]/g,
    build: (m) => {
      const { target, alias } = wikiTarget(m[2] ?? "");
      if (!target) return null;
      const embed = m[1] === "!";
      return el(
        embed ? "matrx-embed" : "matrx-wikilink",
        { dataTarget: target, ...(alias ? { dataAlias: alias } : {}) },
        [text(alias ?? target)],
      );
    },
  },
  {
    re: /(^|[^\w@])@(fig|tbl|eq|sec):([\w.-]*[\w])/g,
    build: (m, ctx) => {
      const label = `${m[2]}:${m[3]}`;
      return xrefNode(label, XREF_PREFIX[m[2] ?? ""] ?? null, ctx, "at");
    },
  },
  {
    re: /\\(eqref|ref)\{([^{}\s]+)\}/g,
    build: (m, ctx) => xrefNode(m[2] ?? "", m[1] === "eqref" ? "eq" : null, ctx, m[1] === "eqref" ? "eqref" : "ref"),
  },
  {
    // ==highlight== — no space just inside either marker, never part of `===`.
    re: /(?<![=\\])==(?=[^\s=])([^\n]*?[^\s=\\])==(?!=)/g,
    build: (m) => el("mark", { className: MARK_CLASS }, [text(m[1] ?? "")], "matrxMark"),
  },
  {
    // x^2^ — Pandoc superscript: no whitespace inside.
    re: /(?<![\\^])\^([^\s^]+?)\^/g,
    build: (m) => el("sup", {}, [text(m[1] ?? "")], "matrxSup"),
  },
  {
    // H~2~O — Pandoc subscript (single tilde; GFM's ~~strike~~ is parsed first).
    re: /(?<![\\~])~([^\s~]+?)~(?!~)/g,
    build: (m) => el("sub", {}, [text(m[1] ?? "")], "matrxSub"),
  },
  {
    // A footnote reference whose definition lives in another rendered block.
    re: /\[\^([^\]\s]+)\](?!:)/g,
    build: (m, ctx) => {
      const id = m[1] ?? "";
      if (ctx.footnotes.has(id.toLowerCase())) return null;
      return el("sup", { className: ["matrx-fnref"] }, [
        el("a", { href: `#user-content-fn-${encodeURIComponent(id.toLowerCase())}`, dataFootnoteRef: true, ariaDescribedBy: "footnote-label" }, [text(id)]),
      ]);
    },
  },
];

/** The leading character a rule consumed only as context (the `@` rule's boundary). */
function leadingContext(m: RegExpExecArray, rule: Rule): string {
  return rule === RULES[1] ? (m[1] ?? "") : "";
}

/** Split one string into text + element nodes. */
export function scanInline(value: string, ctx: InlineContext): MNode[] | null {
  if (!value) return null;
  // Cheap pre-check: every rule needs one of these characters.
  if (!/[[=^~@\\]/.test(value)) return null;
  const out: MNode[] = [];
  let pos = 0;
  let changed = false;
  while (pos < value.length) {
    let best: { m: RegExpExecArray; rule: Rule } | null = null;
    for (const rule of RULES) {
      rule.re.lastIndex = pos;
      const m = rule.re.exec(value);
      if (!m) continue;
      const start = m.index + leadingContext(m, rule).length;
      if (!best || start < best.m.index + leadingContext(best.m, best.rule).length) best = { m, rule };
    }
    if (!best) break;
    const lead = leadingContext(best.m, best.rule);
    const start = best.m.index + lead.length;
    const end = best.m.index + best.m[0].length;
    const node = best.rule.build(best.m, ctx);
    if (!node) {
      // Not ours after all — keep the text and continue past the match start.
      out.push(text(value.slice(pos, start + 1)));
      pos = start + 1;
      continue;
    }
    if (start > pos) out.push(text(value.slice(pos, start)));
    // Nested marks (a highlight holding a superscript) scan their own text.
    if (node.type === "matrxMark" || node.type === "matrxSup" || node.type === "matrxSub") {
      const inner = node.children?.[0]?.value ?? "";
      const nested = scanInline(inner, ctx);
      if (nested) node.children = nested;
    }
    out.push(node);
    pos = end;
    changed = true;
  }
  if (!changed) return null;
  if (pos < value.length) out.push(text(value.slice(pos)));
  // Collapse adjacent text pieces the "not ours" branch produced.
  const merged: MNode[] = [];
  for (const n of out) {
    const prev = merged[merged.length - 1];
    if (n.type === "text" && prev?.type === "text") prev.value = (prev.value ?? "") + (n.value ?? "");
    else merged.push(n);
  }
  return merged;
}

const SKIP_TYPES = new Set(["link", "linkReference", "inlineCode", "code", "math", "inlineMath", "html", "matrxMark", "matrxSup", "matrxSub"]);
/** Elements whose text is already final (a wikilink's name, an unresolved `@fig:x`). */
const SKIP_ELEMENTS = new Set(["matrx-wikilink", "matrx-embed", "matrx-xref", "a", "kbd", "code", "matrx-csv"]);

/** Run the inline scanner over every eligible text node in the tree. */
export function transformInline(node: MNode, ctx: InlineContext): void {
  const children = node.children;
  if (!children || SKIP_TYPES.has(node.type)) return;
  if (node.data?.hName && SKIP_ELEMENTS.has(node.data.hName)) return;
  let next: MNode[] | null = null;
  children.forEach((child, i) => {
    if (child.type === "text") {
      const replaced = scanInline(child.value ?? "", ctx);
      if (replaced) {
        next ??= children.slice(0, i);
        next.push(...replaced);
        return;
      }
    } else {
      transformInline(child, ctx);
    }
    next?.push(child);
  });
  if (next) node.children = next;
}

/** `:kbd[…]`'s class, re-exported for the raw `<kbd>` default element. */
export { KBD_CLASS };
