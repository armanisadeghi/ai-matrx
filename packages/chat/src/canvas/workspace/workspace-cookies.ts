/**
 * The chat's and the canvas workspace's remembered layout:
 *   - the SHELL CHAT, per home (`shellChatHome(...).layoutId` — a board, Education,
 *     else `page:<family>`): where it sits (docked / floating) and whether it is open;
 *   - a canvas workspace (ChatCanvasWorkspace), per workspace id: whether its
 *     properties panel is open.
 * Panel WIDTHS are the shared side-panel cookies (`components/official/side-panel`),
 * one per panel kind, so a width the person likes follows them to every page.
 * Plain module: the server readers and the client writers both import it.
 */

import type { SidePanelSizes } from "@ai-matrx/chat/ui/side-panel-width";

export type CanvasChatPlacement = "side" | "floating";

export interface CanvasChatState {
  placement: CanvasChatPlacement;
  open: boolean;
}

/** What a canvas page remembers (`readCanvasWorkspaceLayout` on the server). The chat's is the shell's. */
export interface CanvasWorkspaceLayout {
  propertiesOpen: boolean;
  widths: { properties: number };
}

export const CANVAS_WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Panel ids for the shared width cookies. */
export const CANVAS_PANEL_IDS = {
  chat: "canvas-chat",
  properties: "canvas-properties",
} as const;

export const CANVAS_CHAT_SIZES: SidePanelSizes = { defaultPx: 440, minPx: 340, maxPx: 760 };
export const CANVAS_PROPERTIES_SIZES: SidePanelSizes = { defaultPx: 250, minPx: 220, maxPx: 420 };

export function canvasChatCookieName(workspaceId: string): string {
  return `canvas-workspace:${workspaceId}:chat`;
}

export function canvasPropertiesCookieName(workspaceId: string): string {
  return `canvas-workspace:${workspaceId}:properties`;
}

/** `side` · `floating` · `side:closed` · `floating:closed`. No cookie = the home's default. */
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
