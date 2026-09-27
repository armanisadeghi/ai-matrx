// components/merge-field-input/merge-field-dom.ts
//
// The DOM half of MergeFieldInput, React-free so it is unit-tested in jsdom.
// The stored text is the truth: `renderInto` draws text runs and one atomic
// chip per `{{path}}`; `serializeFrom` reads the element back to exactly the
// text it was drawn from. Caret positions are measured in STORED-text offsets
// (a chip counts as its full `{{path}}` length) so a redraw never moves it.

/** Same grammar as aidream's strict renderer (`_MERGE_FIELD`). */
const MERGE_FIELD_SOURCE =
  "\\{\\{\\s*([A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)\\s*\\}\\}";

/** A fresh global regex each call — a shared one carries `lastIndex` between callers. */
export function mergeFieldRegex(): RegExp {
  return new RegExp(MERGE_FIELD_SOURCE, "g");
}

export const CHIP_ATTR = "data-merge-field";
/** The exact stored spelling of a chip, so `{{ a.b }}` round-trips byte for byte. */
const RAW_ATTR = "data-merge-raw";
/** A trailing <br> the browser needs to show a final empty line; never serialized. */
const SENTINEL_ATTR = "data-merge-sentinel";

export type MergeSegment =
  | { kind: "text"; text: string }
  | { kind: "field"; path: string; raw: string };

export function tokenizeMergeText(text: string): MergeSegment[] {
  const out: MergeSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(mergeFieldRegex())) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    out.push({ kind: "field", path: m[1], raw: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export function hasUnrenderedField(root: HTMLElement): boolean {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (mergeFieldRegex().test(node.textContent ?? "")) return true;
    }
  }
  return false;
}

export function renderInto(
  root: HTMLElement,
  text: string,
  labelFor: (path: string) => string,
  chipClassName: string,
): void {
  root.replaceChildren();
  for (const seg of tokenizeMergeText(text)) {
    if (seg.kind === "text") {
      root.appendChild(document.createTextNode(seg.text));
    } else {
      const chip = document.createElement("span");
      chip.setAttribute(CHIP_ATTR, seg.path);
      chip.setAttribute(RAW_ATTR, seg.raw);
      chip.setAttribute("contenteditable", "false");
      chip.className = chipClassName;
      chip.textContent = labelFor(seg.path);
      chip.title = `${labelFor(seg.path)} — filled in when the template is used`;
      root.appendChild(chip);
    }
  }
  // pre-wrap draws a final "\n" only when something follows it.
  if (text.endsWith("\n") || text === "") {
    const br = document.createElement("br");
    br.setAttribute(SENTINEL_ATTR, "");
    root.appendChild(br);
  }
}

function nodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.hasAttribute(CHIP_ATTR)) {
    return node.getAttribute(RAW_ATTR) ?? `{{${node.getAttribute(CHIP_ATTR)}}}`;
  }
  if (node.tagName === "BR") return node.hasAttribute(SENTINEL_ATTR) ? "" : "\n";
  // A browser-inserted block (Chrome wraps a new line in <div>) starts a line.
  const inner = Array.from(node.childNodes).map(nodeText).join("");
  if (node.tagName === "DIV" || node.tagName === "P") return `\n${inner}`;
  return inner;
}

export function serializeFrom(root: HTMLElement): string {
  return Array.from(root.childNodes).map(nodeText).join("");
}

/** Stored-text length of everything in `root` before (container, offset). */
export function storedOffsetOf(root: HTMLElement, container: Node, offset: number): number {
  let total = 0;
  const walk = (node: Node): boolean => {
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        total += offset;
      } else {
        const kids = Array.from(node.childNodes).slice(0, offset);
        total += kids.map(nodeText).join("").length;
      }
      return true;
    }
    if (node instanceof HTMLElement && node.hasAttribute(CHIP_ATTR)) {
      total += nodeText(node).length;
      return false;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      total += (node.textContent ?? "").length;
      return false;
    }
    if (node !== root && node instanceof HTMLElement) {
      if (node.tagName === "BR") {
        total += nodeText(node).length;
        return false;
      }
      if (node.tagName === "DIV" || node.tagName === "P") total += 1;
    }
    for (const child of Array.from(node.childNodes)) if (walk(child)) return true;
    return false;
  };
  walk(root);
  return total;
}

/** The DOM point for a stored-text offset, in a tree drawn by `renderInto`. */
export function pointAtStoredOffset(
  root: HTMLElement,
  target: number,
): { node: Node; offset: number } {
  let remaining = target;
  const kids = Array.from(root.childNodes);
  for (let i = 0; i < kids.length; i += 1) {
    const node = kids[i];
    const len = nodeText(node).length;
    if (node.nodeType === Node.TEXT_NODE) {
      if (remaining <= len) return { node, offset: remaining };
    } else if (remaining < len || remaining === 0) {
      // At or inside a chip: the caret goes just before it.
      return { node: root, offset: i };
    }
    remaining -= len;
  }
  const lastIndex = kids.length;
  const last = kids[lastIndex - 1];
  if (last instanceof HTMLElement && last.hasAttribute(SENTINEL_ATTR)) {
    return { node: root, offset: lastIndex - 1 };
  }
  return { node: root, offset: lastIndex };
}
