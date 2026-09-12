/**
 * Storage-usage arithmetic for the Local Storage admin screen.
 *
 * A SCREEN NEVER LIES. The meter rendered
 * `used / (used + remaining) * 100` straight into a tooltip. That division
 * is indeterminate whenever the two readings sum to zero — a storage backend
 * that reports nothing, a reading taken before the first measurement lands —
 * and the screen printed the sentence "NaN% used". `0 / 0` is not zero; it is
 * unknown, and unknown reads as the em-dash.
 *
 * `remaining` is ALSO the weak half of the reading: `getStorageSize()` derives
 * it by subtracting from an ASSUMED 5MB quota, so an over-quota origin makes
 * it negative and the raw ratio exceeds 100%. The label reports the honest
 * number either way; only the decorative bar is clamped into its track.
 *
 * Lives in its own module so the ratio can be tested without rendering the
 * (very large) admin component.
 */

import {
  clampedBarWidth,
  formatPercentFromFraction,
  safeRatio,
  UNKNOWN_DISPLAY,
} from "@/lib/format/honest";

export interface StorageSizeReading {
  used: number;
  remaining: number;
}

/** The 0..1 usage fraction, or `null` when the reading cannot determine one. */
export function storageUsageFraction(
  size: StorageSizeReading,
): number | null {
  return safeRatio(size.used, size.used + size.remaining);
}

export function storageUsagePercentLabel(size: StorageSizeReading): string {
  const fraction = storageUsageFraction(size);
  if (fraction === null) {
    return `${UNKNOWN_DISPLAY} used (total capacity unknown)`;
  }
  return `${formatPercentFromFraction(fraction, { digits: 1 })} used`;
}

export function storageUsageBarWidth(size: StorageSizeReading): string {
  return clampedBarWidth(storageUsageFraction(size));
}
