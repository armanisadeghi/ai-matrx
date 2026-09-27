/**
 * Spatial view — THROW gestures (pure).
 *
 * Drag a tile by its header and let go with speed: the flick's direction is a
 * command. What each direction does is the host's choice (a knob, not
 * hard-coded taste); the board's defaults are in `DEFAULT_THROW_ACTIONS`.
 *
 * The rules that make a gesture trustworthy (Apple, Linear, Superhuman):
 *   - it must be DELIBERATE: a speed floor AND a distance floor, so a quick
 *     reposition never fires a command;
 *   - it must be VISIBLE before release: the hint names the action while the
 *     pointer is still down (`throwPreview`);
 *   - it must be REVERSIBLE after: the host undoes it, and a destructive
 *     direction asks first.
 */

export type ThrowDirection = "left" | "right" | "up" | "down";

export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

/** Screen px per ms. ~1.1 is a clear flick; a careful drag is under 0.5. */
export const THROW_MIN_SPEED = 1.1;
/** Screen px of travel since pointerdown. */
export const THROW_MIN_DISTANCE = 70;
/** Velocity is measured over this trailing window. */
export const VELOCITY_WINDOW_MS = 90;
/** How far the dominant axis must beat the other for a direction to count. */
const AXIS_DOMINANCE = 1.35;

/** Keeps the last few pointer samples and measures release velocity. */
export class VelocityTracker {
  private samples: PointerSample[] = [];

  reset(s: PointerSample): void {
    this.samples = [s];
  }

  push(s: PointerSample): void {
    this.samples.push(s);
    const cutoff = s.t - VELOCITY_WINDOW_MS * 2;
    while (this.samples.length > 2 && this.samples[0].t < cutoff) this.samples.shift();
  }

  /** Velocity (px/ms) over the trailing window ending at the last sample. */
  velocity(): { vx: number; vy: number } {
    const last = this.samples[this.samples.length - 1];
    if (!last) return { vx: 0, vy: 0 };
    let first = last;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      first = this.samples[i];
      if (last.t - first.t >= VELOCITY_WINDOW_MS) break;
    }
    const dt = last.t - first.t;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }
}

/** The direction a release would throw, or null if it is just a move. */
export function detectThrow(
  velocity: { vx: number; vy: number },
  travel: { dx: number; dy: number },
): ThrowDirection | null {
  const speed = Math.hypot(velocity.vx, velocity.vy);
  if (speed < THROW_MIN_SPEED) return null;
  if (Math.hypot(travel.dx, travel.dy) < THROW_MIN_DISTANCE) return null;
  const ax = Math.abs(velocity.vx);
  const ay = Math.abs(velocity.vy);
  if (ax >= ay * AXIS_DOMINANCE) return velocity.vx > 0 ? "right" : "left";
  if (ay >= ax * AXIS_DOMINANCE) return velocity.vy > 0 ? "down" : "up";
  return null; // diagonal: ambiguous, so it is a move
}

/** `delete` destroys what the tile shows (after a confirm); `remove` only takes
 * the tile off the board — what it shows lives on elsewhere. */
export type ThrowAction = "park" | "save-close" | "delete" | "remove" | "none";

/** The board's defaults. Left is unassigned until a real need claims it. */
export const DEFAULT_THROW_ACTIONS: Record<ThrowDirection, ThrowAction> = {
  right: "park",
  up: "save-close",
  down: "delete",
  left: "none",
};

export const THROW_ACTION_LABEL: Record<ThrowAction, string> = {
  park: "Release to park",
  "save-close": "Release to save & close",
  delete: "Release to delete",
  remove: "Release to take off the board",
  none: "",
};
