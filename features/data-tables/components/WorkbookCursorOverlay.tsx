/**
 * WorkbookCursorOverlay — pixel-positioned remote cursor rings.
 *
 * Sits inside the WorkbookEditor container, above the Univer canvas. For each
 * remote peer with a known sheet + (row, col), we query Univer for the cell's
 * DOMRect and absolutely-position a colored ring over it. Stale peers (>30s
 * since last update) and peers on a different active sheet are hidden.
 *
 * Refresh strategy:
 *   - Awareness changes (peer joins / cursor moves) — driven by the parent
 *     passing a new `states` Map.
 *   - Local scroll / zoom / row-col resize — subscribe via `worksheet.onScroll`;
 *     bump a token to re-query rects.
 *   - Active-sheet switch — re-subscribe and re-render.
 *   - Window resize — `resize` listener bumps the token.
 *
 * We deliberately do NOT use a polling rAF loop; rects only change in response
 * to discrete events, so an event-driven invalidation keeps idle CPU at zero.
 */
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { AwarenessState } from "../collab/types";

// Univer facade is loose at the boundary; narrow with structural types.
type CellRect = { left: number; top: number; width: number; height: number };

type FRangeLike = {
  getCellRect(): DOMRect;
};

// Univer facade fields are typed as required by the .d.ts but in practice
// some build flavors or boot races leave them undefined; mirror that with
// optional method signatures so our runtime guards (?.) actually narrow.
type FWorksheetLike = {
  getSheetId?: () => string;
  getRange?: (row: number, column: number) => FRangeLike;
  onScroll?: (callback: () => void) => { dispose(): void } | undefined;
};

type FWorkbookLike = {
  getActiveSheet?: () => FWorksheetLike | null;
  getSheetBySheetId?: (sheetId: string) => FWorksheetLike | null;
};

type FUniverLike = {
  getActiveWorkbook?: () => FWorkbookLike | undefined;
};

type Props = {
  /**
   * The Univer facade. Pass `apiRef.current` from WorkbookEditor; falsy values
   * disable the overlay (useful during boot / unmount races).
   */
  univerAPI: unknown;
  /** The Univer container element — rect lookups are translated relative to this. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Map of clientID → AwarenessState (from the WorkbookCollabSession awareness Map). */
  states: Map<number, AwarenessState>;
  selfUid: string;
};

const STALE_AFTER_MS = 30_000;

export function WorkbookCursorOverlay({
  univerAPI,
  containerRef,
  states,
  selfUid,
}: Props) {
  // Token forces re-render when scroll/resize/active-sheet events fire.
  const [refreshToken, setRefreshToken] = useState(0);
  const bump = () => setRefreshToken((n) => n + 1);

  // Track active sheet id reactively so the overlay clears cursors that point
  // at the OTHER sheet (Univer only displays one at a time).
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  // Subscribe to scroll on the currently active sheet + active-sheet switches.
  useEffect(() => {
    const api = univerAPI as FUniverLike | null | undefined;
    if (!api) return;
    let scrollDisposer: { dispose(): void } | null | undefined;

    const subscribeActive = () => {
      // Defensive across the whole boundary — Univer's facade typing is
      // loose; a missing field or a mid-boot null reference here would
      // crash the route, not just the overlay. Swallow + log; the worst
      // case is stale cursor positions for one tick.
      try {
        const wb = api.getActiveWorkbook?.();
        const sheet = wb?.getActiveSheet?.();
        const newId = sheet?.getSheetId?.() ?? null;
        setActiveSheetId((prev) => (prev === newId ? prev : newId));
        scrollDisposer?.dispose();
        scrollDisposer = sheet?.onScroll?.(() => bump());
      } catch (err) {
        console.warn("[workbook] cursor overlay: subscribe failed", err);
      }
    };

    // Poll the active sheet at a low rate as a belt-and-braces watchdog
    // for active-sheet changes, since Univer's facade does not (in this
    // version) expose a top-level onActiveSheetChanged. 750ms is invisible
    // to the user and quiescent CPU-wise.
    subscribeActive();
    const interval = setInterval(subscribeActive, 750);

    const onWinResize = () => bump();
    window.addEventListener("resize", onWinResize, { passive: true });

    return () => {
      clearInterval(interval);
      scrollDisposer?.dispose();
      window.removeEventListener("resize", onWinResize);
    };
  }, [univerAPI]);

  // Build the visible-peer set: not stale, not self, on the active sheet,
  // with row+col both set.
  const peers = useMemo(() => {
    const now = Date.now();
    const out: AwarenessState[] = [];
    states.forEach((s) => {
      if (!s) return;
      if (s.uid === selfUid) return;
      if (now - s.ts > STALE_AFTER_MS) return;
      if (s.row === null || s.col === null) return;
      if (s.sheetId !== null && activeSheetId !== null && s.sheetId !== activeSheetId) return;
      out.push(s);
    });
    return out;
  }, [states, selfUid, activeSheetId]);

  // Compute cell rects for the visible peers. Recomputed on every render
  // (refreshToken bumps trigger renders); each Univer call is cheap and the
  // peer count is bounded by the room size.
  const rects = useCellRects(univerAPI, containerRef, peers, refreshToken);

  if (peers.length === 0) return null;

  return (
    <div
      // Container-relative absolute layer; pointer-events:none so the user's
      // own clicks pass through to Univer underneath.
      className="pointer-events-none absolute inset-0 z-10"
      aria-hidden
    >
      {peers.map((peer, i) => {
        const r = rects[i];
        if (!r) return null;
        return (
          <div
            key={peer.uid}
            className="absolute transition-[transform,opacity] duration-150"
            style={{
              transform: `translate(${r.left}px, ${r.top}px)`,
              width: r.width,
              height: r.height,
            }}
          >
            {/* Ring outline */}
            <div
              className="absolute inset-0 rounded-[1px]"
              style={{
                border: `2px solid ${peer.color}`,
                boxShadow: `0 0 0 1px ${peer.color}33`,
              }}
            />
            {/* Name tag — top-right, snug above the cell */}
            <div
              className="absolute -top-[18px] right-[-2px] whitespace-nowrap rounded-sm px-1 text-[10px] font-medium leading-[14px] text-white"
              style={{ backgroundColor: peer.color }}
            >
              {peer.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Query Univer for the cell rect of each peer, translated to be relative to
 * the overlay container. Returns nulls for peers whose cell cannot currently
 * be located (off-screen, sheet not active, race during sheet switch).
 */
function useCellRects(
  univerAPI: unknown,
  containerRef: React.RefObject<HTMLElement | null>,
  peers: AwarenessState[],
  // Read but not used inside; the token forces this hook to re-run whenever
  // an event-source (scroll, resize, sheet-switch) bumps it.
  _refreshToken: number,
): Array<CellRect | null> {
  const [rects, setRects] = useState<Array<CellRect | null>>([]);

  // useLayoutEffect so the overlay paints aligned, not one frame after.
  useLayoutEffect(() => {
    const api = univerAPI as FUniverLike | null | undefined;
    const container = containerRef.current;
    if (!api || !container || peers.length === 0) {
      setRects([]);
      return;
    }
    const wb = api.getActiveWorkbook?.();
    if (!wb) {
      setRects([]);
      return;
    }
    const containerBox = container.getBoundingClientRect();
    const next: Array<CellRect | null> = peers.map((peer) => {
      try {
        const sheet = peer.sheetId
          ? wb.getSheetBySheetId?.(peer.sheetId) ?? wb.getActiveSheet?.()
          : wb.getActiveSheet?.();
        if (!sheet) return null;
        if (peer.row === null || peer.col === null) return null;
        const range = sheet.getRange?.(peer.row, peer.col);
        const cellDom = range?.getCellRect();
        if (!cellDom) return null;
        // getCellRect returns viewport-relative coordinates; translate into
        // container-local pixels so the overlay div positions correctly even
        // when the page itself is scrolled or padded.
        return {
          left: cellDom.left - containerBox.left,
          top: cellDom.top - containerBox.top,
          width: cellDom.width,
          height: cellDom.height,
        };
      } catch {
        return null;
      }
    });
    setRects(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [univerAPI, peers, _refreshToken]);

  return rects;
}
