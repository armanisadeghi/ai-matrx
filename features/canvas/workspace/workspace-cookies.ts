/**
 * ChatCanvasWorkspace's remembered layout — per workspace id: where the chat
 * sits (docked / floating), whether it is open, and whether the properties
 * panel is open. Panel WIDTHS are the shared side-panel cookies
 * (`components/official/side-panel`), one per panel kind, so a width the
 * person likes follows them to every canvas page.
 * Plain module: the server reader and the client writer both import it.
 */

import type { SidePanelSizes } from "@/components/official/side-panel/side-panel-width";
import type { CanvasNavPersisted } from "@/features/shell/canvas-chrome/canvas-nav-cookie";

export type CanvasChatPlacement = "side" | "floating";

export interface CanvasChatState {
  placement: CanvasChatPlacement;
  open: boolean;
}

/** Everything a canvas page remembers (`readCanvasWorkspaceLayout` on the server). */
export interface CanvasWorkspaceLayout {
  nav: CanvasNavPersisted;
  chat: CanvasChatState;
  propertiesOpen: boolean;
  widths: { nav: number; chat: number; properties: number };
}

export const CANVAS_WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Panel ids for the shared width cookies. */
export const CANVAS_PANEL_IDS = {
  nav: "canvas-nav",
  chat: "canvas-chat",
  properties: "canvas-properties",
} as const;

export const CANVAS_NAV_SIZES: SidePanelSizes = { defaultPx: 240, minPx: 200, maxPx: 360 };
export const CANVAS_CHAT_SIZES: SidePanelSizes = { defaultPx: 440, minPx: 340, maxPx: 760 };
export const CANVAS_PROPERTIES_SIZES: SidePanelSizes = { defaultPx: 250, minPx: 220, maxPx: 420 };

export function canvasChatCookieName(workspaceId: string): string {
  return `canvas-workspace:${workspaceId}:chat`;
}

export function canvasPropertiesCookieName(workspaceId: string): string {
  return `canvas-workspace:${workspaceId}:properties`;
}

/** `side` · `floating` · `side:closed` · `floating:closed`. No cookie = the host's default. */
export function parseCanvasChatCookie(
  value: string | undefined,
  defaultOpen: boolean,
): CanvasChatState {
  if (!value) return { placement: "side", open: defaultOpen };
  const [placement, openness] = value.split(":");
  return {
    placement: placement === "floating" ? "floating" : "side",
    open: openness !== "closed",
  };
}

export function serializeCanvasChatState(state: CanvasChatState): string {
  return state.open ? state.placement : `${state.placement}:closed`;
}

export function writeCanvasChatCookie(workspaceId: string, state: CanvasChatState): void {
  document.cookie = `${canvasChatCookieName(workspaceId)}=${serializeCanvasChatState(state)}; path=/; max-age=${CANVAS_WORKSPACE_COOKIE_MAX_AGE}; samesite=lax`;
}

export function parseCanvasPropertiesCookie(value: string | undefined): boolean {
  return value !== "closed";
}

export function writeCanvasPropertiesCookie(workspaceId: string, open: boolean): void {
  document.cookie = `${canvasPropertiesCookieName(workspaceId)}=${open ? "open" : "closed"}; path=/; max-age=${CANVAS_WORKSPACE_COOKIE_MAX_AGE}; samesite=lax`;
}
