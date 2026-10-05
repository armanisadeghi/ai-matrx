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

import {
  ALL_KIND_SPELLINGS,
  firstKindSlug,
  hasExoticKindKey,
  hasJsonKindKey,
  hasKindKey,
  scanKindSpellingRegions,
  withoutZeroWidth,
} from "@/features/content-ir/surfaces/json-kind-signal";

/**
 * What counts as a kind key ON SCREEN: the key itself, or its backslash-escaped
 * form — `{\"__kind\":…}` is a raw view of an object holding a string-held
 * kind, and that IS a leak (ruling c, round 6).
 */
export function screenTextHoldsKind(text: string): boolean {
  // Every spelling the owner ruled a kind (round 8): escaped, markdown-escaped,
  // repr, typographic quotes, entities, zero-width in the key.
  // Exotic spellings (double entities, `&#95;`, fullwidth quotes, bidi marks
  // in the key) are DETECTION ONLY: reported here, converted nowhere (round 9).
  return hasKindKey(text, ALL_KIND_SPELLINGS) || hasExoticKindKey(text);
}

/**
 * THE RENDER-FAILURE answer (round 10): on-screen text that shows a REAL JSON
 * kind — a `{` owning a JSON-spelled key (literal, `\u005f`, markdown-escaped,
 * zero-width in the key), complete, still open, or cut where its grammar
 * breaks. Every other spelling (`{\"__kind\":…}` in prose, repr, a JS literal,
 * typographic quotes, entities, a bare prose mention) is DETECTION ONLY: the
 * sentinel reports it (`screenTextHoldsKind`), the frame judge does not fail on it.
 */
export function screenTextShowsJsonKind(text: string): boolean {
  return hasJsonKindKey(text) && scanKindSpellingRegions(text).length > 0;
}

/** The kind slug named in on-screen text (escaped form included), or null. */
export function screenKindSlug(text: string): string | null {
  return firstKindSlug(text, ALL_KIND_SPELLINGS);
}

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

/**
 * A person's own editor (ruling b): any contenteditable that is not "false" —
 * `""`, `"true"` and `"plaintext-only"` all edit. Editors are skipped like
 * inputs; the editors that can hold stored kind text are ALSO marked
 * `data-kind-source="explicit"` at the component.
 */
function isEditable(el: Element): boolean {
  const value = el.getAttribute("contenteditable");
  return value !== null && value.toLowerCase() !== "false";
}

function isSkipped(el: Element): boolean {
  return SKIP_TAGS.has(el.tagName) || el.hasAttribute(KIND_SOURCE_ATTR) || isEditable(el);
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
  return screenTextHoldsKind(visibleKindText(root, cap));
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
    for (let child: Element | null = current.firstElementChild; child; child = child.nextElementSibling) {
      if (isSkipped(child)) continue;
      if (screenTextHoldsKind(visibleKindText(child, cap))) {
        deeper = child;
        break;
      }
    }
    if (!deeper) return current;
    current = deeper;
  }
}

/** Attributes a person reads (tooltip, screen reader, image text) — R3 round 6. */
export const KIND_LEAK_ATTRIBUTES = ["title", "aria-label", "alt"] as const;
/**
 * Elements whose own STATE a person reads beyond attributes (R8-3): a
 * read-only or disabled field's `value`, and an iframe's `srcdoc`.
 */
const HELD_SELECTOR = "input,textarea,iframe[srcdoc]";
const ATTRIBUTE_SELECTOR = [...KIND_LEAK_ATTRIBUTES.map((name) => `[${name}]`), HELD_SELECTOR].join(",");

/**
 * What the sentinel's observer watches beyond the readable attributes: a
 * field turning read-only, a srcdoc being set, and the source marker itself
 * (removing `data-kind-source` re-scans that subtree, R8-3 b).
 */
export const KIND_WATCHED_STATE_ATTRIBUTES = ["readonly", "disabled", "value", "srcdoc", "data-kind-source"] as const;

/** Whether a field is one a person READS (read-only or disabled) — an editable one is their own input. */
function isReadOnlyField(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return false;
  const field = el as HTMLInputElement | HTMLTextAreaElement;
  if (el.tagName === "INPUT" && /^(?:hidden|password|checkbox|radio|file)$/i.test((field as HTMLInputElement).type)) {
    return false;
  }
  return field.readOnly || field.disabled;
}

/** The kind leak in a read-only field's value or an iframe's srcdoc, or null. */
function heldKindLeakOf(el: Element): KindAttributeLeak | null {
  if (el.hasAttribute(KIND_SOURCE_ATTR)) return null;
  if (isReadOnlyField(el)) {
    const value = el.value;
    if (!value || !withoutZeroWidth(value).includes("kind")) return null;
    if (!screenTextHoldsKind(value.replace(/[“”„‟″]/g, '"'))) return null;
    return el.parentElement && isInsideKindSource(el.parentElement) ? null : { element: el, attribute: "value", value };
  }
  if (el.tagName === "IFRAME") {
    // The STRING the host set — never the frame's document (no cross-origin access).
    const html = el.getAttribute("srcdoc");
    if (!html || !withoutZeroWidth(html).includes("kind") || typeof DOMParser === "undefined") return null;
    if (isInsideKindSource(el)) return null;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const leaks = textLeaksKind(doc.body) || findKindAttributeLeaks(doc.body, 1).length > 0;
    return leaks ? { element: el, attribute: "srcdoc", value: html.slice(0, 2000) } : null;
  }
  return null;
}

export interface KindAttributeLeak {
  element: Element;
  attribute: string;
  value: string;
}

/** Whether one element's own readable attributes hold a kind key (outside source views). */
export function attributeKindLeakOf(el: Element): KindAttributeLeak | null {
  const held = heldKindLeakOf(el);
  if (held) return held;
  for (const attribute of KIND_LEAK_ATTRIBUTES) {
    const value = el.getAttribute(attribute);
    if (value && withoutZeroWidth(value).includes("kind") && screenTextHoldsKind(value.replace(/[“”„‟″]/g, '"'))) {
      return isInsideKindSource(el) ? null : { element: el, attribute, value };
    }
  }
  return null;
}

/**
 * Every readable attribute under (and on) `root` that holds a kind key, up to
 * `limit`. One native selector query — cheap enough for the changed nodes the
 * sentinel hands it.
 */
export function findKindAttributeLeaks(root: Node, limit = 20): KindAttributeLeak[] {
  const leaks: KindAttributeLeak[] = [];
  if (root.nodeType !== ELEMENT_NODE && root.nodeType !== 9 && root.nodeType !== 11) return leaks;
  if (root.nodeType === ELEMENT_NODE) {
    const own = attributeKindLeakOf(root as Element);
    if (own) leaks.push(own);
  }
  const scope = root as ParentNode;
  if (typeof scope.querySelectorAll !== "function") return leaks;
  for (const el of Array.from(scope.querySelectorAll(ATTRIBUTE_SELECTOR))) {
    if (leaks.length >= limit) break;
    const leak = attributeKindLeakOf(el);
    if (leak) leaks.push(leak);
  }
  return leaks;
}

/**
 * THE whole-subtree answer: does anything under `root` show a REAL JSON kind
 * (round 10, `screenTextShowsJsonKind`) — as visible text OR in a readable
 * attribute (title / aria-label / alt)? The DOM
 * frame judge reads this; the runtime sentinel reads the same two pieces
 * (`textLeaksKind` via its incremental runs, `findKindAttributeLeaks` on what
 * changed), so the test judge and the live sentinel can never disagree (K3).
 */
export function domLeaksKind(root: Node): boolean {
  if (isInsideKindSource(root)) return false;
  if (screenTextShowsJsonKind(visibleKindText(root))) return true;
  return findKindAttributeLeaks(root).some((leak) => screenTextShowsJsonKind(attributeScreenText(leak)));
}

/**
 * Whether `root` shows a kind ONLY in a detection-only spelling (round 10):
 * the sentinel reports it; it is not a render failure.
 */
export function domShowsDetectionOnlyKind(root: Node): boolean {
  if (isInsideKindSource(root) || domLeaksKind(root)) return false;
  return textLeaksKind(root) || findKindAttributeLeaks(root, 1).length > 0;
}

/** What a person reads of an attribute leak (an iframe srcdoc: its body text). */
function attributeScreenText(leak: KindAttributeLeak): string {
  const value = leak.value.replace(/[“”„‟″]/g, '"');
  if (leak.attribute !== "srcdoc" || typeof DOMParser === "undefined") return value;
  return visibleKindText(new DOMParser().parseFromString(leak.value, "text/html").body);
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
