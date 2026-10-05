/**
 * THE LEAK SENTINEL (G1) — the detector that catches the paths nobody listed.
 * Three adversarial rounds kept finding one more screen that drew a `__kind`
 * as text; every gate decides BEFORE rendering, so a path that skipped every
 * gate was invisible until a person saw it. This reads the DOM AFTER
 * rendering: any text outside an explicit source container
 * (`data-kind-source`) that holds a `__kind` key is a leak, filed in the Error
 * Inspector (`captureError`, source "content-ir") once per DOM place per page
 * load, rate-limited, and in development also a loud console.error.
 *
 * Never mutates the DOM, never throws, negligible cost: mutations are batched
 * after a quiet `debounceMs`, only the changed nodes (plus a little sibling
 * context) are read, in idle slices of `maxCharsPerSlice` characters, and
 * unfinished work carries forward instead of being dropped (H2, round 5).
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  domPathOf,
  findKindAttributeLeaks,
  findKindLeak,
  KIND_LEAK_ATTRIBUTES,
  screenKindSlug,
  screenTextHoldsKind,
  identifyingAttributesOf,
  isInsideKindSource,
  visibleKindText,
} from "@/features/content-ir/surfaces/kind-leak-scan";

export interface KindLeakSentinelOptions {
  root?: Node;
  debounceMs?: number;
  /** Characters read per idle slice; unfinished work carries to the next slice. */
  maxCharsPerSlice?: number;
  maxReportsPerPage?: number;
  /** Loud console.error per leak (development by default). */
  logToConsole?: boolean;
}

const reported = new Set<string>();
let reportCount = 0;

/** Test seam: forget what was reported this "page load". */
export function resetKindLeakSentinelReports(): void {
  reported.clear();
  reportCount = 0;
}

function report(
  leak: Element,
  options: Required<Omit<KindLeakSentinelOptions, "root">>,
  inAttribute?: { name: string; value: string },
): void {
  const path = domPathOf(leak);
  const key = inAttribute ? `${path}@${inAttribute.name}` : path;
  if (reported.has(key) || reportCount >= options.maxReportsPerPage) return;
  reported.add(key);
  reportCount += 1;
  const text = inAttribute ? inAttribute.value.slice(0, 4000) : visibleKindText(leak, 4000);
  const slug = screenKindSlug(text);
  const attributes = identifyingAttributesOf(leak);
  const where = inAttribute ? `in its ${inAttribute.name} attribute` : "as raw text";
  try {
    captureError({
      source: "content-ir",
      relation: slug ?? undefined,
      message: `A kind${slug ? ` ("${slug}")` : ""} reached the screen ${where} at ${path}.`,
      hint: "This element drew `__kind` JSON outside any data-kind-source container. Route the value through AnswerValueView / MarkdownStream (text) or kindTextLabel (titles, tooltips), or mark a deliberate source view with data-kind-source=\"explicit\".",
      raw: {
        path,
        attributes,
        className: leak.getAttribute("class") ?? "",
        excerpt: text.slice(0, 300),
        ...(inAttribute ? { attribute: inAttribute.name } : {}),
      },
      recoverable: true,
    });
  } catch {
    // The sentinel must never take the page down.
  }
  if (options.logToConsole) {
    try {
      console.error(`[kind-leak-sentinel] raw __kind on screen at ${path}`, attributes, leak);
    } catch {
      /* never throws */
    }
  }
}

/**
 * Characters of sibling text read on each side of a change, so a key split
 * across sibling nodes (highlighted spans, streamed tokens, emphasis that ate
 * the underscores) is read whole without reading the whole parent.
 */
const CHANGE_CONTEXT_CHARS = 64;

/**
 * One unit of scan work: the sibling run `first … last` under `parent`,
 * read in windows. `first` advances as windows finish, so an unfinished run
 * carries forward to the next idle slice instead of being dropped (H2).
 */
interface ScanRun {
  parent: Node;
  first: Node;
  last: Node;
}

type IdleHandle = { cancel: () => void };

function requestSlice(run: () => void): IdleHandle {
  const g = globalThis as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof g.requestIdleCallback === "function") {
    const handle = g.requestIdleCallback(run, { timeout: 2000 });
    return { cancel: () => g.cancelIdleCallback?.(handle) };
  }
  const handle = setTimeout(run, 0);
  return { cancel: () => clearTimeout(handle) };
}

/** The run around `changed` (siblings in order), widened by `CHANGE_CONTEXT_CHARS` each side. */
function runAround(parent: Node, firstChanged: Node, lastChanged: Node): ScanRun {
  let first = firstChanged;
  let read = 0;
  while (first.previousSibling && read < CHANGE_CONTEXT_CHARS) {
    first = first.previousSibling;
    read += visibleKindText(first, CHANGE_CONTEXT_CHARS).length;
  }
  let last = lastChanged;
  read = 0;
  while (last.nextSibling && read < CHANGE_CONTEXT_CHARS) {
    last = last.nextSibling;
    read += visibleKindText(last, CHANGE_CONTEXT_CHARS).length;
  }
  return { parent, first, last };
}

/**
 * Watch `root` for rendered kind text. Returns a disposer. Safe to call in any
 * environment; a no-op where MutationObserver is missing.
 *
 * Cost (H2, round 5): only what CHANGED is read — an added node, a changed
 * text node's element, plus a few dozen characters of sibling context — never
 * the parent it landed in. Work is done in idle slices of at most
 * `maxCharsPerSlice` characters; what a slice does not finish (the initial
 * full-page scan, a huge addition) carries forward to the next slice, so no
 * cap ever decides what is seen and no pending change is ever dropped.
 */
export function installKindLeakSentinel(options: KindLeakSentinelOptions = {}): () => void {
  const root = options.root ?? (typeof document !== "undefined" ? document.body : undefined);
  if (!root || typeof MutationObserver === "undefined") return () => undefined;
  const resolved = {
    debounceMs: options.debounceMs ?? 750,
    maxCharsPerSlice: options.maxCharsPerSlice ?? 50_000,
    maxReportsPerPage: options.maxReportsPerPage ?? 20,
    logToConsole: options.logToConsole ?? process.env.NODE_ENV === "development",
  };
  const sliceChars = Math.max(1_000, resolved.maxCharsPerSlice);

  const touched = new Set<Node>();
  /** Elements whose readable attribute changed (attributes only, no text read). */
  const attributeTouched = new Set<Element>();
  const queue: ScanRun[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let slice: IdleHandle | null = null;
  let disposed = false;

  const reportIn = (parent: Node, nodes: Node[]) => {
    for (const node of nodes) {
      if (node.nodeType === 1 && screenTextHoldsKind(visibleKindText(node))) {
        const leak = findKindLeak(node);
        if (leak) report(leak, resolved);
        return;
      }
    }
    // The key spans siblings: the parent is the place that drew it.
    const place = parent.nodeType === 1 ? (parent as Element) : nodes[0]?.parentElement;
    if (place) report(place, resolved);
  };

  /** Read windows of `run` until the slice budget is spent; true when the run is finished. */
  const advance = (run: ScanRun, budget: { left: number }): boolean => {
    if (!run.parent.isConnected || isInsideKindSource(run.parent)) return true;
    let window: Node[] = [];
    let text = "";
    const check = () => {
      if (window.length && screenTextHoldsKind(text)) reportIn(run.parent, window);
    };
    const start = run.first;
    for (let node: Node | null = run.first; node; node = node.nextSibling) {
      const isLast = node === run.last;
      if (node.nodeType === 1 && isInsideKindSource(node)) {
        check();
        window = [];
        text = "";
      } else if (node.nodeType === 3 && (node.nodeValue ?? "").length > sliceChars) {
        // One huge text node: a single regex pass over it, never a capped read.
        check();
        window = [];
        text = "";
        const value = node.nodeValue ?? "";
        budget.left -= value.length;
        if (screenTextHoldsKind(value.replace(/[“”„‟″]/g, '"'))) reportIn(run.parent, [node]);
      } else {
        const own = visibleKindText(node, sliceChars + 1);
        budget.left -= own.length;
        if (own.length > sliceChars && node.firstChild) {
          // Too big to read in one window: its children are their own run.
          check();
          window = [];
          text = "";
          queue.unshift({ parent: node, first: node.firstChild, last: node.lastChild! });
        } else {
          if (text.length + own.length > sliceChars && window.length) {
            check();
            // Overlap one node so a key across the window edge is still read whole.
            const carry = window[window.length - 1]!;
            window = [carry];
            text = visibleKindText(carry, sliceChars);
          }
          window.push(node);
          text += own;
        }
      }
      if (isLast) {
        check();
        return true;
      }
      if (budget.left <= 0 && node.nextSibling) {
        check();
        // Carry the rest forward, re-reading this node as overlap (unless it
        // is where this slice started — then move on, so a run always advances).
        run.first = node === start ? node.nextSibling : node;
        return false;
      }
    }
    check();
    return true;
  };

  const runSlice = () => {
    slice = null;
    if (disposed) return;
    try {
      const budget = { left: sliceChars };
      while (queue.length && budget.left > 0) {
        const run = queue[0]!;
        const done = advance(run, budget);
        if (done) {
          const at = queue.indexOf(run);
          if (at >= 0) queue.splice(at, 1);
        }
      }
    } catch {
      // Never throws; drop only the run that threw.
      queue.shift();
    }
    if (queue.length && !disposed) slice = requestSlice(runSlice);
  };

  const reportAttributes = (node: Node) => {
    for (const leak of findKindAttributeLeaks(node)) {
      report(leak.element, resolved, { name: leak.attribute, value: leak.value });
    }
  };

  const flush = () => {
    timer = null;
    try {
      // Readable attributes (title / aria-label / alt) of what changed — one
      // native selector query per changed node, never the whole page again.
      for (const node of touched) {
        if (node.isConnected && node.nodeType === 1 && !isInsideKindSource(node)) reportAttributes(node);
      }
      for (const node of attributeTouched) {
        if (node.isConnected && !isInsideKindSource(node)) reportAttributes(node);
      }
      attributeTouched.clear();
      // Group what changed by parent: one run from the first to the last
      // changed child, with sibling context — never the whole parent.
      const byParent = new Map<Node, Node[]>();
      for (const node of touched) {
        if (!node.isConnected) continue;
        if (node === root) {
          if (root.firstChild) queue.push({ parent: root, first: root.firstChild, last: root.lastChild! });
          continue;
        }
        const parent = node.parentNode;
        if (!parent) continue;
        const list = byParent.get(parent);
        if (list) list.push(node);
        else byParent.set(parent, [node]);
      }
      touched.clear();
      for (const [parent, nodes] of byParent) {
        if (isInsideKindSource(parent)) continue;
        if (nodes.length === 1) {
          queue.push(runAround(parent, nodes[0]!, nodes[0]!));
          continue;
        }
        const set = new Set(nodes);
        let first: Node | null = null;
        let last: Node | null = null;
        for (let child = parent.firstChild; child; child = child.nextSibling) {
          if (!set.has(child)) continue;
          if (!first) first = child;
          last = child;
        }
        if (first && last) queue.push(runAround(parent, first, last));
      }
    } catch {
      touched.clear();
    }
    if (queue.length && !slice) slice = requestSlice(runSlice);
  };

  const schedule = (node: Node) => {
    touched.add(node);
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, resolved.debounceMs);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target.nodeType === 1) {
          attributeTouched.add(record.target as Element);
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(flush, resolved.debounceMs);
        }
      } else if (record.type === "characterData") {
        // A changed text node: read its element (and that element's neighbours).
        schedule(record.target.parentElement ?? record.target);
      } else {
        record.addedNodes.forEach((node) => schedule(node));
      }
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...KIND_LEAK_ATTRIBUTES],
  });
  schedule(root);

  return () => {
    disposed = true;
    observer.disconnect();
    if (timer !== null) clearTimeout(timer);
    slice?.cancel();
    touched.clear();
    attributeTouched.clear();
    queue.length = 0;
  };
}
