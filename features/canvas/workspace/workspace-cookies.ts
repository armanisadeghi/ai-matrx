/**
 * ChatCanvasWorkspace's persisted chat placement — per workspace id.
 * Plain module: the server reader and the client writer both import it.
 */

export type CanvasChatPlacement = "side" | "floating";

export const CANVAS_CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function canvasChatCookieName(workspaceId: string): string {
  return `canvas-workspace:${workspaceId}:chat`;
}

export function parseCanvasChatCookie(value: string | undefined): CanvasChatPlacement {
  return value === "floating" ? "floating" : "side";
}

export function writeCanvasChatCookie(workspaceId: string, placement: CanvasChatPlacement): void {
  document.cookie = `${canvasChatCookieName(workspaceId)}=${placement}; path=/; max-age=${CANVAS_CHAT_COOKIE_MAX_AGE}; samesite=lax`;
}
