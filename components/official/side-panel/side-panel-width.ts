/**
 * A docked side panel's remembered width — per panel id, per browser.
 *
 * Plain module (no next/headers, no "use client"): the server reader
 * (`side-panel-width.server.ts`) and the client writer both import it, so the
 * first paint is already at the width the person left it at.
 */

/** A panel's sizes in px: where it opens, and how far a drag may take it. */
export interface SidePanelSizes {
  defaultPx: number;
  minPx: number;
  maxPx: number;
}

export const SIDE_PANEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function sidePanelWidthCookieName(panelId: string): string {
  return `side-panel:${panelId}:width`;
}

export function clampSidePanelWidth(width: number, sizes: SidePanelSizes): number {
  if (!Number.isFinite(width)) return sizes.defaultPx;
  return Math.round(Math.min(sizes.maxPx, Math.max(sizes.minPx, width)));
}

/** A stored width, clamped to today's limits; anything unreadable is the default. */
export function parseSidePanelWidth(value: string | undefined, sizes: SidePanelSizes): number {
  if (!value) return sizes.defaultPx;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? sizes.defaultPx : clampSidePanelWidth(parsed, sizes);
}

export function writeSidePanelWidth(panelId: string, width: number): void {
  document.cookie = `${sidePanelWidthCookieName(panelId)}=${Math.round(width)}; path=/; max-age=${SIDE_PANEL_COOKIE_MAX_AGE}; samesite=lax`;
}

export function readSidePanelWidthClient(panelId: string, sizes: SidePanelSizes): number {
  if (typeof document === "undefined") return sizes.defaultPx;
  const name = `${sidePanelWidthCookieName(panelId)}=`;
  const hit = document.cookie.split("; ").find((part) => part.startsWith(name));
  return parseSidePanelWidth(hit?.slice(name.length), sizes);
}
