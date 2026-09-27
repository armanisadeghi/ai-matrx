/**
 * Spatial view — what a wheel event MEANS (pure).
 *
 * Browsers report a mouse wheel, a trackpad swipe and a trackpad pinch all as
 * `wheel` events. The board answers each the way that input's owners expect:
 *
 *   mouse wheel      → zoom at the cursor (Miro, Google Maps; the owner's call)
 *   trackpad swipe   → pan (every Mac canvas: Figma, FigJam, tldraw, Freeform)
 *   trackpad pinch   → zoom (the browser sends it as ctrl+wheel)
 *
 * The owner-facing knob is `WheelMode`: "auto" (above), "zoom" (every scroll
 * zooms) or "pan" (every scroll pans; ctrl/⌘ zooms — Figma's default).
 *
 * Telling a mouse from a trackpad has no API. The signals every canvas uses:
 *   - line/page delta modes only come from wheels (Firefox mice);
 *   - a trackpad produces horizontal delta and fractional or small steps;
 *   - a wheel notch is a large, whole, vertical-only step (≥ ~40px);
 * and one gesture is one device — a trackpad swipe's inertia tail has small
 * deltas that must not flip to "mouse" halfway, so a classification sticks for
 * the rest of a burst of events.
 */

export type WheelMode = "auto" | "zoom" | "pan";
export type WheelIntent = "zoom" | "pan";
export type WheelDevice = "mouse" | "trackpad";

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  /** Event time, ms. */
  timeStamp: number;
}

/** Events closer together than this belong to one gesture. */
export const GESTURE_GAP_MS = 120;
const MOUSE_NOTCH_MIN_PX = 40;

export function classifyDevice(e: WheelSample): WheelDevice {
  if (e.deltaMode !== 0) return "mouse";
  if (e.deltaX !== 0) return "trackpad";
  const dy = Math.abs(e.deltaY);
  if (!Number.isInteger(e.deltaY)) return "trackpad";
  return dy >= MOUSE_NOTCH_MIN_PX ? "mouse" : "trackpad";
}

/** Stateful classifier: one decision per gesture burst. */
export class WheelInterpreter {
  private device: WheelDevice | null = null;
  private lastAt = -Infinity;

  constructor(public mode: WheelMode = "auto") {}

  intent(e: WheelSample): WheelIntent {
    // A pinch (or a deliberate ctrl/⌘ scroll) always zooms.
    if (e.ctrlKey || e.metaKey) return "zoom";
    if (this.mode === "zoom") return "zoom";
    if (this.mode === "pan") return "pan";
    const fresh = e.timeStamp - this.lastAt > GESTURE_GAP_MS;
    this.lastAt = e.timeStamp;
    if (fresh || this.device === null) this.device = classifyDevice(e);
    else if (this.device === "mouse" && classifyDevice(e) === "trackpad" && e.deltaX !== 0) {
      // Horizontal motion inside a "mouse" burst can only be a trackpad.
      this.device = "trackpad";
    }
    return this.device === "mouse" ? "zoom" : "pan";
  }
}

export const WHEEL_MODE_LABEL: Record<WheelMode, string> = {
  auto: "Mouse zooms, trackpad pans",
  zoom: "Scroll always zooms",
  pan: "Scroll always pans",
};
