/**
 * Storage-usage arithmetic for the Local Storage admin screen.
 *
 * Extracted from the inline JSX expressions so the ratio can be tested
 * without rendering the (very large) admin component.
 */

export interface StorageSizeReading {
  used: number;
  remaining: number;
}

export function storageUsagePercentLabel(size: StorageSizeReading): string {
  return `${((size.used / (size.used + size.remaining)) * 100).toFixed(1)}% used`;
}

export function storageUsageBarWidth(size: StorageSizeReading): string {
  return `${(size.used / (size.used + size.remaining)) * 100}%`;
}
