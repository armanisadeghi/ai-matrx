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
 * and scanned after a quiet `debounceMs`, and each flush reads at most
 * `maxCharsPerFlush` characters.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { firstKindSlug } from "@/features/content-ir/surfaces/json-kind-signal";
import {
  domPathOf,
  findKindLeak,
  identifyingAttributesOf,
  isInsideKindSource,
  visibleKindText,
} from "@/features/content-ir/surfaces/kind-leak-scan";

export interface KindLeakSentinelOptions {
  root?: Node;
  debounceMs?: number;
  maxCharsPerFlush?: number;
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

function report(leak: Element, options: Required<Omit<KindLeakSentinelOptions, "root">>): void {
  const path = domPathOf(leak);
  if (reported.has(path) || reportCount >= options.maxReportsPerPage) return;
  reported.add(path);
  reportCount += 1;
  const text = visibleKindText(leak, 4000);
  const slug = firstKindSlug(text);
  const attributes = identifyingAttributesOf(leak);
  try {
    captureError({
      source: "content-ir",
      relation: slug ?? undefined,
      message: `A kind${slug ? ` ("${slug}")` : ""} reached the screen as raw text at ${path}.`,
      hint: "This element drew `__kind` JSON outside any data-kind-source container. Route the value through AnswerValueView / MarkdownStream, or mark a deliberate source view with data-kind-source=\"explicit\".",
      raw: { path, attributes, className: leak.getAttribute("class") ?? "", excerpt: text.slice(0, 300) },
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
 * Watch `root` for rendered kind text. Returns a disposer. Safe to call in any
 * environment; a no-op where MutationObserver is missing.
 */
export function installKindLeakSentinel(options: KindLeakSentinelOptions = {}): () => void {
  const root = options.root ?? (typeof document !== "undefined" ? document.body : undefined);
  if (!root || typeof MutationObserver === "undefined") return () => undefined;
  const resolved = {
    debounceMs: options.debounceMs ?? 750,
    maxCharsPerFlush: options.maxCharsPerFlush ?? 200_000,
    maxReportsPerPage: options.maxReportsPerPage ?? 20,
    logToConsole: options.logToConsole ?? process.env.NODE_ENV === "development",
  };

  const pending = new Set<Node>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    try {
      let budget = resolved.maxCharsPerFlush;
      const targets = [...pending];
      pending.clear();
      for (const target of targets) {
        if (budget <= 0) break;
        if (!target.isConnected) continue;
        const element = target.nodeType === 1 ? (target as Element) : target.parentElement;
        if (!element || isInsideKindSource(element)) continue;
        // A key split across siblings (highlighted spans) only shows in the parent's text.
        const scope = element.parentElement && element.parentElement !== root ? element.parentElement : element;
        const leak = findKindLeak(scope, budget);
        budget -= (scope.textContent ?? "").length;
        if (leak) report(leak, resolved);
      }
    } catch {
      // Never throws.
    }
  };

  const schedule = (node: Node) => {
    pending.add(node);
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, resolved.debounceMs);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") {
        schedule(record.target);
      } else {
        record.addedNodes.forEach((node) => schedule(node));
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  schedule(root);

  return () => {
    observer.disconnect();
    if (timer !== null) clearTimeout(timer);
    pending.clear();
  };
}
