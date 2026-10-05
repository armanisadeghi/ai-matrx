/**
 * Which pages get the shell's chat dock, and the key its open/closed choice is
 * remembered under. Plain module: the server (AppShell's cookie read) and the
 * dock both import it.
 */

import { isCanvasChromeRoute } from "@ai-matrx/chat/utils/shell/canvas-chrome-routes";

/** Fired on window to open or close the shell's chat (the header's chat button). */
export const SHELL_CHAT_TOGGLE_EVENT = "matrx:shell-chat-toggle";

/** With no remembered choice, the chat starts open at this width and up. */
export const SHELL_CHAT_WIDE_QUERY = "(min-width: 1440px)";

/** Below this, an open chat folds a domain panel to the strip. */
export const SHELL_CHAT_FOLD_QUERY = "(max-width: 1599px)";

/**
 * What the chat does to a domain panel (Settings, an area's menu) beside it.
 * Only a person's OWN open — a remembered choice of `true` — folds the panel
 * on a narrow desktop. The no-choice default (open at ≥ 1440px) never folds:
 * between 1440 and 1599px it would land /user-settings with no menu at all.
 * Closing the chat restores the panel to its saved state.
 */
export function shellChatDomainPanelAction({
  open,
  choice,
  narrow,
}: {
  open: boolean;
  /** The remembered choice for this page family; null = never chosen. */
  choice: boolean | null;
  /** True below SHELL_CHAT_FOLD_QUERY's width. */
  narrow: boolean;
}): "fold" | "restore" | "leave" {
  if (!open) return "restore";
  return choice === true && narrow ? "fold" : "leave";
}

/** /chat is the chat itself; the code workspace docks its own coding agent. */
const OWN_CHAT_PATHS = [/^\/chat(?:\/|$)/, /^\/code(?:\/|$)/, /^\/agent-apps\/[^/]+\/code(?:\/|$)/];

/** The page family a choice is remembered for: the first path segment. */
export function shellChatFamily(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "home";
}

export function shellChatWorkspaceId(family: string): string {
  return `page:${family}`;
}

/** A page that hosts its own canvas workspace chat (Board, Education) or is the full chat. */
export function shellChatHostedElsewhere(pathname: string, signedIn: boolean): boolean {
  return OWN_CHAT_PATHS.some((p) => p.test(pathname)) || isCanvasChromeRoute(pathname, signedIn);
}
