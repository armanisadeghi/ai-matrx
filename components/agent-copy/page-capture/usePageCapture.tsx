"use client";

/**
 * usePageCapture — a surface registers what the person is looking at, once,
 * and three things read it (lane ALCHEMY-BUTTON, Arman 2026-09-25):
 *
 * 1. `<PageCaptureButton />` — the visible Alchemy menu for the page: copy
 *    everything, "Only the data", or the Groomer to filter section by section;
 * 2. the admin debug context (`useDebugContext`) — the same entries, namespaced
 *    by the page title, while debug mode is on;
 * 3. LargeIndicator "Copy Full Context" — appends the capture, debug mode or not.
 *
 * Why a module store (the SurfaceRuntimeContext pattern): the control may sit in
 * a page header while the state it needs lives several components down (the
 * inspector's compare view). Descendants add sections with
 * `usePageCaptureContribution`; the capture is built at click time from the
 * LIVE getters, never a stale snapshot. The most recent registration wins.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ledgerForCapture } from "@/lib/diagnostics/stream-capture/request-ledger";
import { useDebugContext } from "@/hooks/useDebugContext";
import {
  mergePageCapture,
  pageCaptureDebugEntries,
  type PageCapture,
  type PageCaptureContribution,
  type PageCaptureRequest,
  type PageCaptureSection,
} from "./pageCapture";

type Getter = () => PageCapture;
type SectionsGetter = () => PageCaptureSection[] | Omit<PageCaptureContribution, "owner">;

let nextId = 0;
let version = 0;
let captures: Array<{ id: number; get: Getter }> = [];
let contributions: Array<{ id: number; owner: string; get: SectionsGetter }> = [];
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;
const getServerVersion = () => 0;

/** Register a page's live capture getter. Returns its unregister. */
export function registerPageCapture(get: Getter): () => void {
  const id = ++nextId;
  captures = [...captures, { id, get }];
  emit();
  return () => {
    captures = captures.filter((c) => c.id !== id);
    emit();
  };
}

/** Register sections owned by a descendant of the page. Returns its unregister. */
export function registerPageCaptureContribution(owner: string, get: SectionsGetter): () => void {
  const id = ++nextId;
  contributions = [...contributions, { id, owner, get }];
  emit();
  return () => {
    contributions = contributions.filter((c) => c.id !== id);
    emit();
  };
}

/** Tell subscribers a registered getter's answer changed (a new signature). */
export function touchPageCapture(): void {
  emit();
}

/** Whether any page has registered a capture right now. */
export function hasPageCapture(): boolean {
  return captures.length > 0;
}

/**
 * The live capture: the most recent page registration plus every contribution.
 *
 * `_version` is the registry version a component read with `usePageCaptureVersion()`. Pass it
 * from render: the React Compiler memoizes a call with no reactive input, so a render-time
 * `getActivePageCapture()` with no argument is computed once and never again.
 */
export function getActivePageCapture(_version?: number): PageCapture | null {
  const top = captures[captures.length - 1];
  if (!top) return null;
  const merged: PageCaptureContribution[] = contributions.map((c) => {
    const got = c.get();
    return Array.isArray(got) ? { owner: c.owner, sections: got } : { owner: c.owner, ...got };
  });
  return mergePageCapture(top.get(), merged);
}

/** Re-render when the registry changes (the control appears/disappears, data lands). */
export function usePageCaptureVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getServerVersion);
}

/** The capture input a surface supplies; the hook adds route, address and requests. */
export type PageCaptureInput = Omit<PageCapture, "route" | "requests"> & {
  route?: string;
  requests?: PageCaptureRequest[];
};

/** The capture carries the last 20 requests from the one request ledger, failing ones first. */
const REQUEST_LOG_LIMIT = 20;

/**
 * Register this page's capture. `build` is called at click time (and when the
 * signature changes, for the debug context), so pass live state.
 *
 * `signature` — a short string that changes when what the page shows changes
 * (the selection's ids, a row count, a status). It drives the debug-context
 * publish; it defaults to the capture's identity, selection, errors and section ids.
 */
export function usePageCapture(
  build: () => PageCaptureInput,
  opts: { signature?: string; enabled?: boolean } = {},
): void {
  const enabled = opts.enabled ?? true;
  const pathname = usePathname();
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  });

  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  });

  // Registered once for the mount; the getter reads the LATEST build and path.
  useEffect(() => {
    if (!enabled) return;
    return registerPageCapture((): PageCapture => {
        const input = buildRef.current();
        const log: PageCaptureRequest[] = ledgerForCapture(REQUEST_LOG_LIMIT).map((c) => ({
          method: c.method,
          path: c.path,
          status: c.status,
          client: c.client,
          ...(c.httpStatus !== undefined ? { httpStatus: c.httpStatus } : {}),
          ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
          ...(c.requestId ? { requestId: c.requestId } : {}),
          ...(c.requestBody !== undefined ? { requestBody: c.requestBody } : {}),
          ...(c.requestBodyNote ? { requestBodyNote: c.requestBodyNote } : {}),
          ...(c.errorSentence ? { errorSentence: c.errorSentence } : {}),
          timestamp: c.timestamp,
        }));
        return {
          ...input,
          route: input.route ?? pathRef.current ?? "",
          url: input.url ?? (typeof window !== "undefined" ? window.location.href : undefined),
          requests: [...(input.requests ?? []), ...log],
        };
      });
  }, [enabled]);

  // ── The admin debug context: the same entries, while debug mode is on. ──
  const current = build();
  const { publish, isActive } = useDebugContext(`Page: ${current.title}`);
  const registryVersion = usePageCaptureVersion();
  const signature =
    opts.signature ??
    JSON.stringify([
      current.title,
      current.identity,
      current.selection,
      current.errors,
      current.sections.map((s) => s.id),
    ]);
  useEffect(() => {
    if (!isActive || !enabled) return;
    const live = getActivePageCapture();
    if (live) publish(pageCaptureDebugEntries(live));
  }, [isActive, enabled, signature, registryVersion, publish]);
}

/**
 * A descendant's sections (the inspector's compare view, a grid's rows). The
 * getter is read at click time; `signature` tells the debug context the answer
 * changed.
 */
export function usePageCaptureContribution(
  owner: string,
  getSections: SectionsGetter,
  signature: string,
): void {
  const ref = useRef(getSections);
  useEffect(() => {
    ref.current = getSections;
  });
  useEffect(() => registerPageCaptureContribution(owner, () => ref.current()), [owner]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    touchPageCapture();
  }, [signature]);
}
