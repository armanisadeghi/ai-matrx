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
 * THE CAPTURE IS THE PAGE'S LIVE VALUES (ALC-18, LIST.md D3). There is no private
 * store here: `usePageCapture` publishes to `@ai-matrx/alchemy/surface`'s ONE
 * `liveValues` store, stamped with the surface the page is (the mounted
 * `SurfaceRuntime`'s name), and `usePageCaptureContribution` contributes to it.
 * Every reader — this menu, the debug context, LargeIndicator, an agent through
 * `SurfacePort.getValue` — reads that store, at read time, from the LIVE getters.
 * The most recent publication wins.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { liveValues, type LiveOutline } from "@ai-matrx/alchemy/surface";
import { getSurfaceRuntime } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { ledgerForCapture } from "@/lib/diagnostics/stream-capture/request-ledger";
import { useDebugContext } from "@/hooks/useDebugContext";
import {
  normalizePageCapture,
  pageCaptureDebugEntries,
  type PageCapture,
  type PageCaptureContribution,
  type PageCaptureRequest,
  type PageCaptureSection,
} from "./pageCapture";

type SectionsGetter = () => PageCaptureSection[] | Omit<PageCaptureContribution, "owner">;

const subscribe = (listener: () => void) => liveValues.subscribe(listener);
const getVersion = () => liveValues.version();
const getServerVersion = () => 0;

/**
 * The live capture: the page's LIVE VALUES as published to alchemy's one store
 * (`@ai-matrx/alchemy/surface` `liveValues`, ALC-18), made plain JSON.
 *
 * `_version` is the store version a component read with `usePageCaptureVersion()`. Pass it
 * from render: the React Compiler memoizes a call with no reactive input, so a render-time
 * `getActivePageCapture()` with no argument is computed once and never again.
 */
export function getActivePageCapture(_version?: number): PageCapture | null {
  const live = liveValues.read();
  // Plain JSON at read (V24-TAILS): every consumer — the menu, the Groomer, the debug
  // context — reads the same plain capture, whatever shapes a surface handed over.
  return live ? normalizePageCapture(live) : null;
}

/**
 * The capture's outline WITHOUT building it (no section value is walked into plain JSON). Render
 * reads this; `getActivePageCapture()` is read on use — building the whole capture in render froze
 * a 1,636-organization page on every change (sec_8f1a9be1…). `_version` as in `getActivePageCapture`.
 */
export function getActivePageCaptureOutline(_version?: number): LiveOutline | null {
  return liveValues.outline();
}

/** Re-render when the live values change (the control appears/disappears, data lands). */
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
    return liveValues.publish((): PageCapture => {
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
          // The page's live values belong to the surface it IS: the declared surface mounted now.
          surfaceName: input.surfaceName ?? getSurfaceRuntime()?.surfaceName ?? null,
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
  useEffect(() => liveValues.contribute(owner, () => ref.current()), [owner]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    liveValues.touch();
  }, [signature]);
}
