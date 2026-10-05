/**
 * Which pages get the shell's chat dock, and the key its open/closed choice is
 * remembered under. Plain module: the server (AppShell's cookie read) and the
 * dock both import it.
 */

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

/**
 * The only pages the shell's chat stands aside on: the full chat itself and
 * the code workspace (it docks its own coding agent). Every other page —
 * the Board and Education included — shows THE chat (owner, 2026-10-05: one
 * chat, on every page).
 */
export function shellChatHostedElsewhere(pathname: string): boolean {
  return OWN_CHAT_PATHS.some((p) => p.test(pathname));
}

/** The shell chat's conversation everywhere no page has its own. */
export const SHELL_CHAT_SURFACE_KEY = "canvas-workspace:shell";

/**
 * Where the shell's chat lives on a page:
 *   - `layoutId`     — its remembered open / closed + docked / floating
 *                      (`canvasChatCookieName(layoutId)`);
 *   - `surfaceKey`   — the conversation it shows (and this device's memory of it);
 *   - `addressParam` — the query param that conversation lives at;
 *   - `defaultOpen`  — open with no remembered choice; null = open on a wide
 *                      screen only (SHELL_CHAT_WIDE_QUERY).
 */
export interface ShellChatHome {
  layoutId: string;
  surfaceKey: string;
  addressParam: string;
  defaultOpen: boolean | null;
}

/** One board: /board/<id> (/board and /board/all are the boards list). */
const BOARD_PAGE = /^\/board\/(?!all(?:\/|$))([^/]+)\/?$/;
const EDUCATION_PAGES = /^\/education(?:\/|$)/;

/**
 * Pages whose own layout needs the width: the shell chat stays CLOSED here
 * until the person opens it (the header toggle, Cmd+\); a remembered choice
 * still wins. Add a route here to opt it out of the wide-screen auto-open.
 */
export const SHELL_CHAT_CLOSED_BY_DEFAULT_PAGES: readonly RegExp[] = [/^\/spaces(?:\/|$)/];

/**
 * A page with a chat of its OWN keeps it inside the shell chat: each board
 * has its conversation, signed-in Education has one. The ids, params and
 * defaults are exactly the ones those pages used when they drew their own chat
 * column (ChatCanvasWorkspace, until 2026-10-05), so a person's remembered
 * layout and conversation carry over untouched. Every other page shares one
 * conversation that follows the person, remembered open / closed per family.
 */
export function shellChatHome(pathname: string, signedIn: boolean): ShellChatHome {
  const board = BOARD_PAGE.exec(pathname);
  if (board) {
    const layoutId = `board-${board[1]}`;
    return { layoutId, surfaceKey: `canvas-workspace:${layoutId}`, addressParam: "chat", defaultOpen: true };
  }
  if (signedIn && EDUCATION_PAGES.test(pathname)) {
    return { layoutId: "education", surfaceKey: "canvas-workspace:education", addressParam: "chat", defaultOpen: false };
  }
  return {
    layoutId: shellChatWorkspaceId(shellChatFamily(pathname)),
    surfaceKey: SHELL_CHAT_SURFACE_KEY,
    // `pageChat`, not `chat`: /code keeps its own `?chat=`.
    addressParam: "pageChat",
    defaultOpen: SHELL_CHAT_CLOSED_BY_DEFAULT_PAGES.some((p) => p.test(pathname)) ? false : null,
  };
}

/**
 * Fired on window whenever the shell chat is brought into view (the toggle,
 * ⌘\, a history row, a comment riding along), so a canvas in full screen
 * steps out of it — the chat is never opened behind a full-screen canvas.
 */
export const SHELL_CHAT_REVEAL_EVENT = "matrx:shell-chat-reveal";
