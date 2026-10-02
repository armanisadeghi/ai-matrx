/**
 * One-finger gestures on a terminal, as iOS terminals (Termius, Blink) read them:
 *
 *   tap                     → focus (opens the keyboard)
 *   drag up / down          → scroll the scrollback, by whole lines, with momentum on release
 *   press and hold, no move → select the word under the finger; keep dragging to extend
 *
 * Pure: the host feeds pointer samples and the long-press timeout, and acts on what comes back.
 */

export interface GestureSample {
  x: number;
  y: number;
  /** ms */
  t: number;
}

export type GestureAction =
  | { kind: "tap"; x: number; y: number }
  /** Positive = toward newer output (finger moved up). Whole lines only; the remainder is kept. */
  | { kind: "scroll"; lines: number }
  /** Finger lifted mid-scroll: continue with `flingStep` from this velocity (lines/ms, same sign as scroll). */
  | { kind: "fling"; velocity: number }
  | { kind: "select-start"; x: number; y: number }
  | { kind: "select-extend"; x: number; y: number }
  | { kind: "select-end" };

export interface GestureOptions {
  /** Row height in px (font size × line height). */
  lineHeight: number;
  /** Movement under this many px is still a tap / hold. */
  slopPx?: number;
}

/** Press-and-hold time before selection starts (iOS text selection is ~500 ms; terminals use less). */
export const LONG_PRESS_MS = 450;
/** Momentum decay per 16 ms frame. */
export const FLING_FRICTION = 0.95;
/** Below this (lines/ms) momentum stops. */
export const FLING_STOP = 0.002;
/** Releases slower than this (lines/ms) do not fling. */
const FLING_MIN = 0.01;

type Phase = "idle" | "pressed" | "scrolling" | "selecting";

export interface GestureRecognizer {
  down(s: GestureSample): GestureAction[];
  move(s: GestureSample): GestureAction[];
  up(s: GestureSample): GestureAction[];
  cancel(): GestureAction[];
  /** The host's long-press timer fired (LONG_PRESS_MS after down). */
  longPress(): GestureAction[];
  readonly phase: Phase;
}

export function createGestureRecognizer(options: GestureOptions): GestureRecognizer {
  const slop = options.slopPx ?? 8;
  const lineHeight = Math.max(1, options.lineHeight);
  let phase: Phase = "idle";
  let start: GestureSample = { x: 0, y: 0, t: 0 };
  let last: GestureSample = start;
  let carryPx = 0;
  /** Recent samples for release velocity. */
  let trail: GestureSample[] = [];

  function scrollBy(fromY: number, toY: number): GestureAction[] {
    carryPx += fromY - toY;
    const lines = carryPx > 0 ? Math.floor(carryPx / lineHeight) : Math.ceil(carryPx / lineHeight);
    if (lines === 0) return [];
    carryPx -= lines * lineHeight;
    return [{ kind: "scroll", lines }];
  }

  return {
    get phase() {
      return phase;
    },
    down(s) {
      phase = "pressed";
      start = s;
      last = s;
      carryPx = 0;
      trail = [s];
      return [];
    },
    move(s) {
      if (phase === "idle") return [];
      const out: GestureAction[] = [];
      if (phase === "pressed") {
        if (Math.hypot(s.x - start.x, s.y - start.y) <= slop) return [];
        phase = "scrolling";
      }
      if (phase === "scrolling") {
        out.push(...scrollBy(last.y, s.y));
        trail.push(s);
        while (trail.length > 2 && s.t - trail[0]!.t > 100) trail.shift();
      } else if (phase === "selecting") {
        out.push({ kind: "select-extend", x: s.x, y: s.y });
      }
      last = s;
      return out;
    },
    up(s) {
      const was = phase;
      phase = "idle";
      if (was === "pressed") return [{ kind: "tap", x: start.x, y: start.y }];
      if (was === "selecting") return [{ kind: "select-end" }];
      if (was === "scrolling") {
        const out = scrollBy(last.y, s.y);
        trail.push(s);
        const first = trail[0]!;
        const dt = s.t - first.t;
        const velocity = dt > 0 ? (first.y - s.y) / dt / lineHeight : 0;
        if (Math.abs(velocity) >= FLING_MIN) out.push({ kind: "fling", velocity });
        return out;
      }
      return [];
    },
    cancel() {
      const was = phase;
      phase = "idle";
      return was === "selecting" ? [{ kind: "select-end" }] : [];
    },
    longPress() {
      if (phase !== "pressed") return [];
      phase = "selecting";
      return [{ kind: "select-start", x: start.x, y: start.y }];
    },
  };
}

/**
 * One momentum frame: how far to move (lines, fractional) and the decayed velocity. The host
 * accumulates the fractional lines and scrolls whole ones until `velocity` is 0.
 */
export function flingStep(velocity: number, dtMs: number): { lines: number; velocity: number } {
  const lines = velocity * dtMs;
  const next = velocity * Math.pow(FLING_FRICTION, dtMs / 16);
  return { lines, velocity: Math.abs(next) < FLING_STOP ? 0 : next };
}
