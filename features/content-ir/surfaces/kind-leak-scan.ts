/**
 * THE RENDERED-DOM ANSWER to "is a `__kind` key on screen as text?" (G1/G2,
 * round 4 of the never-raw law). Every other gate decides BEFORE rendering;
 * this reads what actually reached the DOM, so it catches the paths nobody
 * listed. ONE piece, read by the runtime leak sentinel (`installKindLeakSentinel`)
 * and the DOM frame judge in tests.
 *
 * A leak is text outside an explicit source container that holds a `__kind`
 * KEY (`hasKindKey` — the one detector). An explicit source container is any
 * element carrying `data-kind-source` (a "View source" pane, a Raw / Copy JSON
 * tab, a code editor, a ```ts / ```xml fence or inline code span the model
 * QUOTED, an admin/debug window). Pure DOM reads: never mutates, never throws.
 */

import { hasKindKey } from "@/features/content-ir/surfaces/json-kind-signal";

/** The one attribute a deliberate raw/source view carries. */
export const KIND_SOURCE_ATTR = "data-kind-source";
/** Spread onto a deliberate raw/source view's root element. */
export const KIND_SOURCE_PROPS = { [KIND_SOURCE_ATTR]: "explicit" } as const;

/** Elements whose text is never rendered content (or is a person's own input). */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);

const ELEMENT_NODE = 1;
/** The markdown delimiter each emphasis element replaced (see `visibleKindText`). */
const EMPHASIS_MARK: Record<string, string> = { STRONG: "__", B: "__", EM: "_", I: "_" };
const TEXT_NODE = 3;

function isSkipped(el: Element): boolean {
  return SKIP_TAGS.has(el.tagName) || el.hasAttribute(KIND_SOURCE_ATTR) || el.getAttribute("contenteditable") === "true";
}

/** Whether a node sits inside an explicit source container (or skipped element). */
export function isInsideKindSource(node: Node): boolean {
  let el: Element | null = node.nodeType === ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el) {
    if (isSkipped(el)) return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * The rendered text of `root` outside source containers, up to `cap`
 * characters. Typographic quotes count as straight ones (a smart-quoting
 * renderer still shows the key).
 */
export function visibleKindText(root: Node, cap = Number.POSITIVE_INFINITY): string {
  let out = "";
  const walk = (node: Node): boolean => {
    if (out.length >= cap) return false;
    if (node.nodeType === TEXT_NODE) {
      out += node.nodeValue ?? "";
      return out.length < cap;
    }
    if (node.nodeType !== ELEMENT_NODE && node.nodeType !== 11 /* fragment */ && node.nodeType !== 9) return true;
    if (node.nodeType === ELEMENT_NODE && isSkipped(node as Element)) return true;
    // Markdown EATS the key's underscores: `{"__kind":"x",…{"__kind"` renders
    // `{"<strong>kind":"x",…{"</strong>kind"` — on screen that is raw JSON
    // (`{"kind":…`). Put back the delimiter emphasis replaced, so the key reads
    // as written (`__` strong, `_` em; harmless for every other text).
    const mark = node.nodeType === ELEMENT_NODE ? EMPHASIS_MARK[(node as Element).tagName] ?? "" : "";
    out += mark;
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (!walk(child)) return false;
    }
    out += mark;
    return true;
  };
  walk(root);
  return out.slice(0, cap).replace(/[“”„‟″]/g, '"');
}

/** Whether `root`'s visible text holds a `__kind` key outside source containers. */
export function textLeaksKind(root: Node, cap?: number): boolean {
  if (isInsideKindSource(root)) return false;
  return hasKindKey(visibleKindText(root, cap));
}

/**
 * The DEEPEST element whose visible text holds the leak (so a report names the
 * paragraph, cell or card that drew it), or null when nothing leaks.
 */
export function findKindLeak(root: Node, cap?: number): Element | null {
  if (!textLeaksKind(root, cap)) return null;
  let current: Element | null =
    root.nodeType === ELEMENT_NODE ? (root as Element) : (root as Node).parentElement ?? (root as Document).documentElement ?? null;
  if (!current) return null;
  for (;;) {
    let deeper: Element | null = null;
    for (let child = current.firstElementChild; child; child = child.nextElementSibling) {
      if (isSkipped(child)) continue;
      if (hasKindKey(visibleKindText(child, cap))) {
        deeper = child;
        break;
      }
    }
    if (!deeper) return current;
    current = deeper;
  }
}

const IDENTIFYING_ATTRS = ["id", "data-testid", "data-block-type", "data-mtx-ctx", "data-language", "data-slot", "data-surface", "role", "aria-label"];

/** A short CSS-ish path to `el` (tag.class:nth-child), for one report per place. */
export function domPathOf(el: Element, depth = 8): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName !== "BODY" && node.tagName !== "HTML" && parts.length < depth) {
    const parent: Element | null = node.parentElement;
    const index = parent ? Array.prototype.indexOf.call(parent.children, node) + 1 : 1;
    const cls = (node.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    parts.unshift(`${node.tagName.toLowerCase()}${cls ? `.${cls}` : ""}:nth-child(${index})`);
    node = parent;
  }
  return parts.join(">");
}

/** The nearest identifying attributes walking up from `el` (block type, test id, surface…). */
export function identifyingAttributesOf(el: Element, depth = 12): Record<string, string> {
  const found: Record<string, string> = {};
  let node: Element | null = el;
  for (let i = 0; node && i < depth; i += 1, node = node.parentElement) {
    for (const name of IDENTIFYING_ATTRS) {
      const value = node.getAttribute(name);
      if (value && !(name in found)) found[name] = value.slice(0, 80);
    }
  }
  return found;
}
