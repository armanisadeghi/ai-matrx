// ─────────────────────────────────────────────────────────────────────────
// rehypeMatrxSyntax — the HTML-side half of the extended syntax. Runs after
// rehype-slug (every heading has an id) and before KaTeX.
//
//   - heading anchors: a quiet "#" link after every heading (visible on hover
//     or focus) so any section can be linked to
//   - table of contents: fills every `<matrx-toc>` placeholder from this
//     tree's headings (the element re-reads the whole document in the
//     browser, so a document the renderer split into blocks still lists all)
//   - task lists: each checkbox learns its index and its item text, so an
//     editable surface can toggle exactly that line in the stored source
//   - footnotes: GitHub's footnote section gets the prose frame's styling
// ─────────────────────────────────────────────────────────────────────────

import type { Element, ElementContent, Root, RootContent } from "hast";
import { toString as hastToString } from "hast-util-to-string";
import type { DocumentNumbering } from "./document-numbering";

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function isElement(node: RootContent | ElementContent | Root): node is Element {
  return node.type === "element";
}

function walk(node: Root | Element, visit: (el: Element, parent: Root | Element) => void): void {
  for (const child of node.children) {
    if (isElement(child)) {
      visit(child, node);
      walk(child, visit);
    }
  }
}

function classList(el: Element): string[] {
  const cls = el.properties?.className;
  if (Array.isArray(cls)) return cls.map(String);
  return typeof cls === "string" ? String(cls).split(/\s+/) : [];
}

const ANCHOR_CLASS = [
  "matrx-heading-anchor",
  "ml-2",
  "select-none",
  "text-[0.8em]",
  "font-normal",
  "text-muted-foreground",
  "no-underline",
  "opacity-0",
  "transition-opacity",
  "hover:text-primary",
  "focus:opacity-100",
  "[:hover>&]:opacity-100",
];

interface TocEntry {
  id: string;
  depth: number;
  text: string;
}

function tocList(entries: TocEntry[]): Element {
  const min = Math.min(...entries.map((e) => e.depth));
  const root: Element = { type: "element", tagName: "ol", properties: { className: ["matrx-toc-list", "space-y-0.5"] }, children: [] };
  const stack: { depth: number; list: Element }[] = [{ depth: min, list: root }];
  for (const entry of entries) {
    while (stack.length > 1 && entry.depth < (stack[stack.length - 1] as { depth: number }).depth) stack.pop();
    let top = stack[stack.length - 1] as { depth: number; list: Element };
    if (entry.depth > top.depth) {
      const nested: Element = { type: "element", tagName: "ol", properties: { className: ["ml-4", "mt-0.5", "space-y-0.5"] }, children: [] };
      const lastItem = top.list.children[top.list.children.length - 1];
      if (lastItem && isElement(lastItem)) lastItem.children.push(nested);
      else top.list.children.push(nested);
      stack.push({ depth: entry.depth, list: nested });
      top = stack[stack.length - 1] as { depth: number; list: Element };
    }
    top.list.children.push({
      type: "element",
      tagName: "li",
      properties: {},
      children: [
        {
          type: "element",
          tagName: "a",
          properties: { href: `#${entry.id}`, className: ["text-foreground/80", "hover:text-primary", "no-underline"] },
          children: [{ type: "text", value: entry.text }],
        },
      ],
    });
  }
  return root;
}

export interface RehypeMatrxSyntaxOptions {
  /** The whole document's numbering — footnotes are numbered document-wide from it. */
  numbering?: DocumentNumbering | null;
}

export default function rehypeMatrxSyntax(options: RehypeMatrxSyntaxOptions = {}) {
  const numbering = options.numbering ?? null;
  return (tree: Root) => {
    const headings: TocEntry[] = [];
    const tocs: Element[] = [];
    let taskIndex = 0;

    walk(tree, (el) => {
      if (HEADINGS.has(el.tagName)) {
        const id = el.properties?.id;
        if (typeof id === "string" && id !== "footnote-label" && !classList(el).includes("sr-only")) {
          headings.push({ id, depth: Number(el.tagName.slice(1)), text: hastToString(el).trim() });
          el.children.push({
            type: "element",
            tagName: "a",
            properties: { href: `#${id}`, className: ANCHOR_CLASS, ariaLabel: "Link to this section", dataHeadingAnchor: true },
            children: [{ type: "text", value: "#" }],
          });
        }
        return;
      }
      if (el.tagName === "matrx-toc") {
        tocs.push(el);
        return;
      }
      if (el.tagName === "li" && classList(el).includes("task-list-item")) {
        const input = findCheckbox(el);
        if (input) {
          input.properties = {
            ...input.properties,
            dataTaskIndex: taskIndex++,
            dataTaskText: taskText(el),
          };
        }
        return;
      }
      if (el.tagName === "section" && el.properties?.dataFootnotes !== undefined) {
        el.properties = {
          ...el.properties,
          className: [...classList(el), "matrx-footnotes", "mt-6", "border-t", "border-border", "pt-3", "text-sm", "text-muted-foreground"],
        };
      }
    });

    for (const toc of tocs) {
      const entries = headings.filter((h) => h.depth <= 4);
      toc.properties = { ...toc.properties, dataTocCount: entries.length };
      toc.children = entries.length > 0 ? [tocList(entries)] : [];
    }

    if (numbering && numbering.footnotes.size > 0) numberFootnotes(tree, numbering.footnotes);
    prefixAuthorIds(tree);
  };
}

const FN_PREFIX = "user-content-fn-";

function footnoteId(href: string): string | null {
  const at = href.indexOf(FN_PREFIX);
  if (at < 0) return null;
  try {
    return decodeURIComponent(href.slice(at + FN_PREFIX.length)).toLowerCase();
  } catch {
    return href.slice(at + FN_PREFIX.length).toLowerCase();
  }
}

/**
 * GitHub numbers footnotes 1… per parsed tree; a document the renderer split
 * into blocks (or a note whose reference is in another block) restarted at
 * "1." (verify-RC-B8 round 2). Every reference's number and every note's list
 * position now come from the document-wide order of first reference.
 */
function numberFootnotes(tree: Root, numbers: Map<string, number>): void {
  walk(tree, (el) => {
    if (el.tagName === "a" && el.properties?.dataFootnoteRef !== undefined) {
      const id = footnoteId(String(el.properties?.href ?? ""));
      const n = id ? numbers.get(id) : undefined;
      if (n !== undefined) el.children = [{ type: "text", value: String(n) }];
      return;
    }
    if (el.tagName === "li") {
      const id = footnoteId(String(el.properties?.id ?? ""));
      const n = id ? numbers.get(id) : undefined;
      if (n !== undefined) el.properties = { ...el.properties, value: n };
    }
  });
}

/** The prefix GitHub puts on every id an author controls. */
export const USER_ID_PREFIX = "user-content-";

/**
 * Every id an author chose (`{#x}`, `:::aside{#x}`, `\label{x}`, heading
 * slugs) goes out as `user-content-x`, so a document can never clobber a
 * page global (`id="__proto__"`, `id="evil"` — verify-RC-B8 LOW). Links keep
 * saying `#x`; the in-document link resolves either spelling.
 */
function prefixAuthorIds(tree: Root): void {
  walk(tree, (el) => {
    const id = el.properties?.id;
    if (typeof id !== "string" || !id || id === "footnote-label" || id.startsWith(USER_ID_PREFIX)) return;
    el.properties = { ...el.properties, id: `${USER_ID_PREFIX}${id}` };
  });
}

function findCheckbox(li: Element): Element | null {
  for (const child of li.children) {
    if (!isElement(child)) continue;
    if (child.tagName === "input" && child.properties?.type === "checkbox") return child;
    if (child.tagName === "p") {
      const inner = findCheckbox(child);
      if (inner) return inner;
    }
  }
  return null;
}

/** The item's own text — nested lists excluded — as the source line shows it, roughly. */
function taskText(li: Element): string {
  const own: Element = {
    ...li,
    children: li.children.filter((c) => !(isElement(c) && (c.tagName === "ul" || c.tagName === "ol"))),
  };
  return hastToString(own).replace(/\s+/g, " ").trim();
}
