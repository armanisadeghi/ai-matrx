/**
 * rectClamp — viewport-safe geometry restoration.
 *
 * When hydrating window geometry from the DB (or the legacy localStorage
 * migration), a rect saved at a larger viewport size or on a different
 * device can land partially or entirely off-screen. This utility clamps
 * stored rects into a sensible shape for the current viewport:
 *
 *  - Width/height capped to viewport minus safe margins.
 *  - Position nudged into bounds so at least a `MIN_VISIBLE_PX` strip of
 *    the header stays draggable.
 *  - If the stored rect is entirely nonsensical (e.g. width 0, negative
 *    coords with huge values), fall back to a centered default.
 */

export interface WindowRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimum chrome strip that must remain visible post-clamp (px). */
const MIN_VISIBLE_PX = 48;

/** Safety padding around the viewport edges. */
const VIEWPORT_PADDING = 8;

/** Sensible fallback dimensions when the stored rect is unusable. */
const FALLBACK_W = 480;
const FALLBACK_H = 360;

let warnedDegenerateViewport = false;

/** SSR / degenerate-measurement fallback viewport. */
const FALLBACK_VIEWPORT_W = 1280;
const FALLBACK_VIEWPORT_H = 800;

let warnedDegenerateMeasurement = false;

/**
 * Viewport dimensions that are safe to derive or judge window geometry from.
 *
 * `window.innerWidth/innerHeight` can measure 0 (hidden or prerendered page,
 * pre-layout read, headless run). Deriving an initial rect from that turns
 * "90vw" into width 0 — the window registers a 0×0 rect, renders as nothing,
 * and stays invisible until something re-clamps it (the "window opens
 * invisible" class, watchdog reason: zero-size). Judging visibility against a
 * 0×0 viewport is just as wrong — every on-screen rect reads as off-screen.
 * A degenerate measurement is never a real screen: fall back to sane
 * dimensions and scream once.
 */
export function safeViewportDims(): { vw: number; vh: number } {
  if (typeof window === "undefined") {
    return { vw: FALLBACK_VIEWPORT_W, vh: FALLBACK_VIEWPORT_H };
  }
  const rawW = window.innerWidth;
  const rawH = window.innerHeight;
  const degenerate =
    !Number.isFinite(rawW) || !Number.isFinite(rawH) || rawW <= 0 || rawH <= 0;
  if (degenerate && !warnedDegenerateMeasurement) {
    warnedDegenerateMeasurement = true;
    console.error(
      "[window-panels] degenerate viewport measurement",
      { innerWidth: rawW, innerHeight: rawH },
      "— using fallback dimensions so window geometry cannot collapse to zero.",
    );
  }
  return {
    vw: Number.isFinite(rawW) && rawW > 0 ? rawW : FALLBACK_VIEWPORT_W,
    vh: Number.isFinite(rawH) && rawH > 0 ? rawH : FALLBACK_VIEWPORT_H,
  };
}

/**
 * Clamp a rect into the current viewport. Pure — caller passes both the
 * rect and the viewport so this works in tests without DOM globals.
 *
 * A zero/negative viewport is a degenerate MEASUREMENT (hidden or embedded
 * pane, pre-layout read, headless run) — never a real screen. Clamping
 * against it collapses any rect to `{x:-48, y:0, width:120, height:80}` and
 * that garbage then gets rendered and persisted, so instead we keep the
 * caller's geometry (sanitising only non-finite values) and scream once.
 *
 * @param rect      Stored rect from DB / LS.
 * @param viewport  { width, height } in CSS pixels.
 */
export function clampRectToViewport(
  rect: WindowRectLike,
  viewport: { width: number; height: number },
): WindowRectLike {
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    if (!warnedDegenerateViewport) {
      warnedDegenerateViewport = true;
      console.warn(
        "[window-panels] clampRectToViewport received a degenerate viewport",
        viewport,
        "— skipping clamp so real window geometry is not destroyed.",
      );
    }
    return {
      x: Number.isFinite(rect.x) ? rect.x : 0,
      y: Number.isFinite(rect.y) ? rect.y : 0,
      width:
        Number.isFinite(rect.width) && rect.width > 0
          ? rect.width
          : FALLBACK_W,
      height:
        Number.isFinite(rect.height) && rect.height > 0
          ? rect.height
          : FALLBACK_H,
    };
  }
  const maxW = Math.max(120, viewport.width - VIEWPORT_PADDING * 2);
  const maxH = Math.max(80, viewport.height - VIEWPORT_PADDING * 2);

  // 1. Sanitise width/height. Reject 0, negative, NaN, or absurdly large.
  let width = rect.width;
  if (!Number.isFinite(width) || width <= 0 || width > viewport.width * 4) {
    width = FALLBACK_W;
  }
  width = Math.min(width, maxW);

  let height = rect.height;
  if (!Number.isFinite(height) || height <= 0 || height > viewport.height * 4) {
    height = FALLBACK_H;
  }
  height = Math.min(height, maxH);

  // 2. Sanitise position. Reject NaN. Keep at least MIN_VISIBLE_PX of the
  //    window's top-left corner inside the viewport so the user can drag it.
  let x = Number.isFinite(rect.x) ? rect.x : 0;
  let y = Number.isFinite(rect.y) ? rect.y : 0;

  const minX = -(width - MIN_VISIBLE_PX);
  const maxX = viewport.width - MIN_VISIBLE_PX;
  x = Math.max(minX, Math.min(maxX, x));

  const minY = 0; // never allow the header to go above the viewport
  const maxY = viewport.height - MIN_VISIBLE_PX;
  y = Math.max(minY, Math.min(maxY, y));

  return { x, y, width, height };
}

/**
 * Center a rect in the viewport, preserving (clamped) width/height.
 * Used when docking a popped-out window back into the parent page.
 */
export function centerRectInViewport(
  rect: WindowRectLike,
  viewport: { width: number; height: number },
): WindowRectLike {
  const sized = clampRectToViewport({ ...rect, x: 0, y: 0 }, viewport);
  const x = Math.max(0, Math.round((viewport.width - sized.width) / 2));
  const y = Math.max(0, Math.round((viewport.height - sized.height) / 2));
  return { x, y, width: sized.width, height: sized.height };
}

/**
 * Convenience wrapper that reads the current window dimensions. Only safe
 * to call on the client.
 */
export function clampRectToCurrentViewport(
  rect: WindowRectLike,
): WindowRectLike {
  if (typeof window === "undefined") return rect;
  return clampRectToViewport(rect, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
}
