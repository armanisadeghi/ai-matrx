/**
 * Which pages get the shell's chat dock, and the key its open/closed choice is
 * remembered under. Plain module: the server (AppShell's cookie read) and the
 * dock both import it.
 */

import { isCanvasChromeRoute } from "@host/features/shell/constants/canvas-chrome-routes";

/** Fired on window to open or close the shell's chat (the header's chat button). */
export const SHELL_CHAT_TOGGLE_EVENT = "matrx:shell-chat-toggle";

/** With no remembered choice, the chat starts open at this width and up. */
export const SHELL_CHAT_WIDE_QUERY = "(min-width: 1440px)";

/** /chat is the chat itself. */
const FULL_CHAT_PATH = /^\/chat(?:\/|$)/;

/** The page family a choice is remembered for: the first path segment. */
export function shellChatFamily(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "home";
}

export function shellChatWorkspaceId(family: string): string {
  return `page:${family}`;
}

/** A page that hosts its own canvas workspace chat (Board, Education) or is the full chat. */
export function shellChatHostedElsewhere(pathname: string, signedIn: boolean): boolean {
  return FULL_CHAT_PATH.test(pathname) || isCanvasChromeRoute(pathname, signedIn);
}
