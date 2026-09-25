// ─────────────────────────────────────────────────────────────────────────
// CONTAINERS — the one directive grammar (remark-directive) and the one
// callout component.
//
//   :::note[Optional title]{fold | fold=open}      callout (9 types + aliases)
//   > [!NOTE]  /  > [!tip]- Title  /  > [!faq]+     GitHub alert / Obsidian callout
//   :::details[Summary]                             collapsible
//   ::::columns / :::column                         side-by-side columns
//   ::::tabs / :::tab[Label]                        tabs
//   :::figure[Caption]{#fig:id}                     numbered figure
//   :::table[Caption]{#tbl:id}                      numbered table caption
//   :::aside                                        aside / sidebar note
//   :::toc  /  ::toc  /  [[toc]]                    table of contents
//   :span[text]{color=red}  :mark[text]{color=yellow}  :kbd[Ctrl]  :abbr[HTML]{title="…"}
//
// Any OTHER `:::name` renders as a neutral container (its content still
// shows); any other `:name` / `::name` is restored to the literal text it was
// — so "ratio 3:2", "10:30" and "key:value" never lose a character.
// ─────────────────────────────────────────────────────────────────────────

import {
  CALLOUT_CLASSES,
  CALLOUT_LABEL,
  resolveCalloutType,
  type CalloutType,
} from "./callout-types";
import { CONTAINER_DIRECTIVES, LEAF_DIRECTIVES, TEXT_DIRECTIVES } from "./names";
import { el, mergeText, rawOf, text, toText, type MNode, type SyntaxFile } from "./mdast-helpers";

type Fold = "none" | "closed" | "open";

/** Build the one callout node. `title` null → the type's own label. */
export function calloutNode(
  type: CalloutType,
  title: MNode[] | null,
  body: MNode[],
  fold: Fold,
): MNode {
  const colors = CALLOUT_CLASSES[type];
  const foldable = fold !== "none";
  const titleChildren: MNode[] = [
    el("matrx-callout-icon", { dataType: type }),
    el("span", { className: ["min-w-0"] }, title && title.length > 0 ? title : [text(CALLOUT_LABEL[type])]),
  ];
  if (foldable) titleChildren.push(el("matrx-callout-icon", { dataType: "chevron" }));
  const titleNode = el(
    foldable ? "summary" : "div",
    {
      className: [
        "matrx-callout-title",
        "flex",
        "items-center",
        "gap-2",
        "text-sm",
        "font-semibold",
        colors.title,
        ...(foldable ? ["cursor-pointer", "list-none", "select-none", "[&::-webkit-details-marker]:hidden"] : []),
      ],
    },
    titleChildren,
  );
  const bodyNode = el(
    "div",
    {
      className: [
        "matrx-callout-body",
        "mt-1.5",
        "text-sm",
        "text-foreground",
        "[&>*:last-child]:mb-0",
        "[&>*:first-child]:mt-0",
      ],
    },
    body,
  );
  return el(
    foldable ? "details" : "div",
    {
      className: [
        "matrx-callout",
        "group/callout",
        "my-3",
        "rounded-md",
        "border-l-4",
        "px-3",
        "py-2",
        colors.frame,
      ],
      dataCallout: type,
      ...(foldable ? {} : { role: "note" }),
      ...(fold === "open" ? { open: true } : {}),
    },
    body.length > 0 ? [titleNode, bodyNode] : [titleNode],
    "matrxCallout",
  );
}

const ALERT_MARKER = /^\[!([A-Za-z][\w-]*)\]([+-])?[ \t]*/;

/**
 * `> [!TYPE]…` → callout. The marker must open the quote's first paragraph;
 * the rest of that first line is the title, everything after is the body.
 * An unknown `[!name]` leaves the blockquote untouched.
 */
function blockquoteToCallout(node: MNode): MNode | null {
  const first = node.children?.[0];
  if (!first || first.type !== "paragraph" || !first.children?.length) return null;
  const lead = first.children[0];
  if (!lead || lead.type !== "text") return null;
  const match = ALERT_MARKER.exec(lead.value ?? "");
  if (!match) return null;
  const type = resolveCalloutType(match[1]);
  if (!type) return null;
  const fold: Fold = match[2] === "-" ? "closed" : match[2] === "+" ? "open" : "none";

  // Split the first paragraph at its first line end: title | first body paragraph.
  const rest = [{ ...lead, value: (lead.value ?? "").slice(match[0].length) }, ...first.children.slice(1)];
  const title: MNode[] = [];
  const bodyInline: MNode[] = [];
  let inBody = false;
  for (const child of rest) {
    if (inBody) {
      bodyInline.push(child);
      continue;
    }
    if (child.type === "break") {
      inBody = true;
      continue;
    }
    if (child.type === "text" && (child.value ?? "").includes("\n")) {
      const value = child.value ?? "";
      const cut = value.indexOf("\n");
      if (cut > 0) title.push(text(value.slice(0, cut)));
      const after = value.slice(cut + 1);
      if (after) bodyInline.push(text(after));
      inBody = true;
      continue;
    }
    title.push(child);
  }
  const titleNodes = title.filter((n) => !(n.type === "text" && !(n.value ?? "").trim()));
  const body: MNode[] = [];
  if (bodyInline.some((n) => !(n.type === "text" && !(n.value ?? "").trim()))) {
    body.push({ type: "paragraph", children: bodyInline });
  }
  body.push(...(node.children?.slice(1) ?? []));
  return calloutNode(type, titleNodes.length > 0 ? titleNodes : null, body, fold);
}

/** A directive's `[label]` paragraph (first child) and the remaining children. */
function splitLabel(node: MNode): { label: MNode[] | null; body: MNode[] } {
  const children = node.children ?? [];
  const first = children[0];
  if (first && first.data?.directiveLabel) {
    return { label: first.children ?? [], body: children.slice(1) };
  }
  return { label: null, body: children };
}

function attr(node: MNode, key: string): string | null | undefined {
  const attrs = node.attributes;
  if (!attrs || !(key in attrs)) return undefined;
  return attrs[key] ?? null;
}

function foldOf(node: MNode): Fold {
  const value = attr(node, "fold") ?? attr(node, "collapse") ?? attr(node, "collapsed");
  if (value === undefined) return "none";
  if (value === "open" || value === "false") return "open";
  return "closed";
}

/**
 * Semantic colour names an author may write on `:span` / `:mark`. Each maps
 * to a light AND dark class, so the text reads in both themes; a raw hex or
 * any other value is ignored (the text renders plain) — never a stored
 * colour that breaks the other theme.
 */
const TEXT_COLORS: Readonly<Record<string, string>> = {
  red: "text-red-600 dark:text-red-400",
  orange: "text-orange-600 dark:text-orange-400",
  amber: "text-amber-600 dark:text-amber-400",
  yellow: "text-yellow-600 dark:text-yellow-300",
  green: "text-green-600 dark:text-green-400",
  teal: "text-teal-600 dark:text-teal-400",
  blue: "text-blue-600 dark:text-blue-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  purple: "text-purple-600 dark:text-purple-400",
  pink: "text-pink-600 dark:text-pink-400",
  gray: "text-zinc-500 dark:text-zinc-400",
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-green-600 dark:text-green-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  info: "text-sky-600 dark:text-sky-400",
};

const HIGHLIGHT_COLORS: Readonly<Record<string, string>> = {
  yellow: "bg-yellow-200/70 dark:bg-yellow-400/25",
  green: "bg-green-200/70 dark:bg-green-400/25",
  blue: "bg-blue-200/70 dark:bg-blue-400/25",
  pink: "bg-pink-200/70 dark:bg-pink-400/25",
  purple: "bg-purple-200/70 dark:bg-purple-400/25",
  orange: "bg-orange-200/70 dark:bg-orange-400/25",
  red: "bg-red-200/70 dark:bg-red-400/25",
  gray: "bg-zinc-200/80 dark:bg-zinc-500/30",
  success: "bg-green-200/70 dark:bg-green-400/25",
  warning: "bg-amber-200/70 dark:bg-amber-400/25",
  danger: "bg-red-200/70 dark:bg-red-400/25",
  info: "bg-sky-200/70 dark:bg-sky-400/25",
};

/** The default `==highlight==` / `:mark[…]` wash. */
export const MARK_CLASS = ["rounded-sm", "px-0.5", "text-inherit", "bg-yellow-200/70", "dark:bg-yellow-400/25"];

export const KBD_CLASS = [
  "rounded",
  "border",
  "border-border",
  "border-b-2",
  "bg-muted",
  "px-1.5",
  "py-px",
  "font-mono",
  "text-[0.8em]",
  "text-foreground",
];

function colorClass(value: string | null | undefined, table: Readonly<Record<string, string>>): string[] {
  if (!value) return [];
  const cls = table[value.trim().toLowerCase()];
  return cls ? cls.split(" ") : [];
}

function textDirective(node: MNode, file: SyntaxFile | undefined): MNode {
  const name = (node.name ?? "").toLowerCase();
  const children = node.children ?? [];
  if (!TEXT_DIRECTIVES.has(name) || children.length === 0) {
    return text(rawOf(node, file) ?? `:${node.name ?? ""}`);
  }
  const color = attr(node, "color") ?? attr(node, "fg");
  const bg = attr(node, "bg") ?? attr(node, "background");
  switch (name) {
    case "span": {
      const classes = [...colorClass(color, TEXT_COLORS), ...colorClass(bg, HIGHLIGHT_COLORS)];
      if (bg && classes.length > 0) classes.push("rounded-sm", "px-0.5");
      return el("span", classes.length > 0 ? { className: classes, dataColor: color ?? bg ?? undefined } : {}, children);
    }
    case "mark": {
      const wash = colorClass(bg ?? color, HIGHLIGHT_COLORS);
      return el(
        "mark",
        { className: wash.length > 0 ? ["rounded-sm", "px-0.5", "text-inherit", ...wash] : MARK_CLASS },
        children,
      );
    }
    case "kbd":
      return el("kbd", { className: KBD_CLASS }, children);
    case "abbr":
      return el("abbr", { title: attr(node, "title") ?? undefined, className: ["cursor-help", "underline", "decoration-dotted"] }, children);
    case "sup":
    case "sub":
      return el(name, {}, children);
    default:
      return text(rawOf(node, file) ?? `:${node.name ?? ""}`);
  }
}

/** The table-of-contents placeholder; the rehype pass fills it from the headings. */
export function tocNode(): MNode {
  return el("matrx-toc", {}, [], "matrxToc");
}

function containerDirective(node: MNode, file: SyntaxFile | undefined): MNode {
  const name = (node.name ?? "").toLowerCase();
  const { label, body } = splitLabel(node);
  const callout = resolveCalloutType(name);
  if (callout && !CONTAINER_DIRECTIVES.has(name)) {
    return calloutNode(callout, label, body, foldOf(node));
  }
  const id = attr(node, "id") ?? undefined;
  switch (name) {
    case "details": {
      const open = attr(node, "open") !== undefined;
      return el("details", { ...(open ? { open: true } : {}), id }, [
        el("summary", {}, label && label.length > 0 ? label : [text("Details")]),
        el("div", { className: ["matrx-details-body"] }, body),
      ]);
    }
    case "columns": {
      const count = body.filter((c) => c.type === "matrxColumn").length;
      const cols = count >= 3 ? "md:grid-cols-3" : "md:grid-cols-2";
      return el("div", { className: ["matrx-columns", "my-3", "grid", "grid-cols-1", "gap-4", cols], id }, body);
    }
    case "column": {
      const lead: MNode[] = label && label.length > 0 ? [{ type: "paragraph", children: label }] : [];
      return el("div", { className: ["matrx-column", "min-w-0", "[&>*:first-child]:mt-0"] }, [...lead, ...body], "matrxColumn");
    }
    case "tabs": {
      const tabs = body.filter((c) => c.type === "matrxTab");
      const labels = tabs.map((t, i) => String(t.data?.hProperties?.dataLabel ?? `Tab ${i + 1}`));
      return el("matrx-tabs", { dataLabels: JSON.stringify(labels), id }, tabs);
    }
    case "tab": {
      const tabLabel = (label ?? []).map(toText).join("").trim()
        || attr(node, "title")
        || attr(node, "label")
        || "";
      return el("matrx-tab", { dataLabel: tabLabel }, body, "matrxTab");
    }
    case "figure":
    case "table": {
      const figure = el(
        "figure",
        {
          className: [name === "table" ? "matrx-table-figure" : "matrx-figure", "my-4"],
          id,
        },
        body,
        "matrxFigure",
      );
      figure.matrxFigure = { kind: name === "table" ? "tbl" : "fig", caption: label ?? [], id: id ?? null };
      return figure;
    }
    case "aside":
      return el(
        "aside",
        {
          className: ["matrx-aside", "my-3", "rounded-md", "border", "border-border", "bg-muted/40", "px-3", "py-2", "text-sm", "[&>*:last-child]:mb-0"],
          id,
        },
        label && label.length > 0 ? [el("p", { className: ["font-semibold"] }, label), ...body] : body,
      );
    case "toc":
      return tocNode();
    default:
      return el(
        "div",
        { className: ["matrx-directive"], dataDirective: name, id },
        label && label.length > 0 ? [{ type: "paragraph", children: label }, ...body] : body,
      );
  }
}

function leafDirective(node: MNode, file: SyntaxFile | undefined): MNode {
  const name = (node.name ?? "").toLowerCase();
  if (LEAF_DIRECTIVES.has(name) && name === "toc") return tocNode();
  return { type: "paragraph", children: [text(rawOf(node, file) ?? `::${node.name ?? ""}`)] };
}

const STRAY_CLOSER = /^:{3,}$/;

/**
 * Resolve every directive and GitHub/Obsidian callout in the tree, children
 * first (so a callout inside a tab or a tab inside a column is already
 * resolved when its parent is built).
 */
export function transformContainers(node: MNode, file: SyntaxFile | undefined): void {
  const children = node.children;
  if (!children) return;
  for (const child of children) transformContainers(child, file);
  const next: MNode[] = [];
  let changed = false;
  for (const child of children) {
    switch (child.type) {
      case "textDirective":
        next.push(textDirective(child, file));
        changed = true;
        continue;
      case "leafDirective":
        next.push(leafDirective(child, file));
        changed = true;
        continue;
      case "containerDirective":
        next.push(containerDirective(child, file));
        changed = true;
        continue;
      case "blockquote": {
        const callout = blockquoteToCallout(child);
        if (callout) {
          next.push(callout);
          changed = true;
          continue;
        }
        break;
      }
      case "paragraph": {
        // The closing `:::` of a container whose opener landed in another
        // rendered block (a split document) — never shown as text.
        const only = child.children?.length === 1 ? child.children[0] : null;
        if (only?.type === "text" && STRAY_CLOSER.test((only.value ?? "").trim())) {
          changed = true;
          continue;
        }
        break;
      }
      default:
        break;
    }
    next.push(child);
  }
  if (changed) node.children = mergeText(next);
}
