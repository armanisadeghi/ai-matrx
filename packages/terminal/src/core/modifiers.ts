/**
 * Ctrl / Alt on the accessory bar: tap once = the next key only; tap twice quickly = locked until
 * tapped again. Pure state machine; the clock is passed in.
 */

export type ModifierState = "off" | "once" | "locked";

export interface ModifierLatch {
  state: ModifierState;
  /** When the latch was last tapped (ms), for double-tap detection. */
  tappedAt: number | null;
}

/** Two taps within this window lock the modifier (iOS's own double-tap timing for Shift lock). */
export const DOUBLE_TAP_MS = 350;

export const MODIFIER_OFF: ModifierLatch = { state: "off", tappedAt: null };

export function tapModifier(latch: ModifierLatch, now: number): ModifierLatch {
  switch (latch.state) {
    case "off":
      return { state: "once", tappedAt: now };
    case "once":
      return latch.tappedAt !== null && now - latch.tappedAt <= DOUBLE_TAP_MS
        ? { state: "locked", tappedAt: now }
        : { state: "off", tappedAt: now };
    case "locked":
      return { state: "off", tappedAt: now };
  }
}

/** After a key used the modifier: a one-shot latch releases, a locked one holds. */
export function afterKey(latch: ModifierLatch): ModifierLatch {
  return latch.state === "once" ? { state: "off", tappedAt: latch.tappedAt } : latch;
}

export function isActive(latch: ModifierLatch): boolean {
  return latch.state !== "off";
}
