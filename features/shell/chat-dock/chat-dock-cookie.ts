/**
 * The shell chat dock's remembered state: open or closed, whether it follows
 * the page's context, and (through the shared side-panel cookie) its width.
 * Plain module: the server reader and the client writer both import it.
 */

import type { SidePanelSizes } from "@/components/official/side-panel/side-panel-width";
import { isCanvasChromeRoute } from "@/features/shell/constants/canvas-chrome-routes";

export const CHAT_DOCK_PANEL_ID = "shell-chat-dock";
export const CHAT_DOCK_OPEN_COOKIE = "shell:chat-dock";
export const CHAT_DOCK_PAGE_CONTEXT_COOKIE = "shell:chat-dock:page";
export const CHAT_DOCK_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const CHAT_DOCK_SIZES: SidePanelSizes = { defaultPx: 420, minPx: 340, maxPx: 720 };

/**
 * The width the dock takes from the page, on `.shell-root` (0px when closed).
 * Anything pinned to the viewport that must stay clear of the dock reads it.
 */
export const CHAT_DOCK_WIDTH_VAR = "--shell-chat-dock-w";

/** What a server render hands the dock and its header button. */
export interface ChatDockInitial {
  open: boolean;
  width: number;
  followsPage: boolean;
}

/** Closed unless the person left it open. */
export function parseChatDockOpen(value: string | undefined): boolean {
  return value === "open";
}

/** On unless the person turned it off. */
export function parseChatDockFollowsPage(value: string | undefined): boolean {
  return value !== "off";
}

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=${CHAT_DOCK_COOKIE_MAX_AGE}; samesite=lax`;
}

export function writeChatDockOpen(open: boolean): void {
  writeCookie(CHAT_DOCK_OPEN_COOKIE, open ? "open" : "closed");
}

export function writeChatDockFollowsPage(on: boolean): void {
  writeCookie(CHAT_DOCK_PAGE_CONTEXT_COOKIE, on ? "on" : "off");
}

/**
 * Why the dock cannot open on this route, or null when it can. The control
 * stays in the header either way (THE HEADER RIGHT SET: disabled, never
 * hidden), and this is its tooltip.
 */
export function chatDockUnavailableReason(pathname: string): string | null {
  if (pathname === "/chat" || pathname.startsWith("/chat/")) {
    return "This page is a chat — the chat panel is for every other page";
  }
  if (isCanvasChromeRoute(pathname)) {
    return "This page has its own chat panel";
  }
  return null;
}
