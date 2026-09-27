/**
 * features/shell/constants/canvas-chrome-routes.ts
 *
 * Routes that render in CANVAS CHROME: the shell stays mounted but its header,
 * sidebar, user block and dock step aside (styles/shell.css §13c) so the page
 * can draw the chat-beside-a-canvas layout
 * (features/canvas/workspace/ChatCanvasWorkspace.tsx).
 *
 * Read on the SERVER by the shell layouts (so a hard load paints right) and on
 * the client by <ShellChromeRouteSync/> (so soft navigation into and out of a
 * listed route flips the attribute). A page that hosts the workspace on an
 * UNLISTED route still gets canvas chrome from <ShellChromeMode/> after
 * hydration — list it here to make its first paint right too.
 *
 * Pure data, no framework imports: both sides import it.
 */

export type ShellChromeMode = "canvas";

export const SHELL_CHROME_ATTRIBUTE = "data-shell-chrome";

export const CANVAS_CHROME_ROUTES: readonly RegExp[] = [
  /^\/demos\/canvas-workspace(?:\/|$)/,
  /^\/demos\/spatial(?:\/|$)/,
  // The Board: /board and /board/<id> — never /board/all (a list page).
  /^\/board(?:\/(?!all(?:\/|$))[^/]+)?\/?$/,
  // A route is listed only once its page RENDERS ChatCanvasWorkspace: listing
  // a page that does not hides the shell's nav with nothing to replace it.
];

/**
 * Modules hosted in the chat-beside-a-canvas layout for SIGNED-IN people only
 * (their layout renders ChatCanvasWorkspace when there is a session; a guest —
 * these pages are public — keeps the ordinary shell, since the chat needs an
 * account).
 */
export const SIGNED_IN_CANVAS_CHROME_ROUTES: readonly RegExp[] = [/^\/education(?:\/|$)/];

/** Stamped on `.shell-root` for a session, so the client can apply the signed-in list. */
export const SHELL_SIGNED_IN_ATTRIBUTE = "data-signed-in";

export function isCanvasChromeRoute(pathname: string, signedIn = false): boolean {
  return (
    CANVAS_CHROME_ROUTES.some((pattern) => pattern.test(pathname)) ||
    (signedIn && SIGNED_IN_CANVAS_CHROME_ROUTES.some((pattern) => pattern.test(pathname)))
  );
}

/** The attributes to spread onto `.shell-root` at SSR. */
export function shellChromeAttributes(pathname: string, signedIn = false): Record<string, string> {
  return {
    ...(signedIn ? { [SHELL_SIGNED_IN_ATTRIBUTE]: "" } : {}),
    ...(isCanvasChromeRoute(pathname, signedIn) ? { [SHELL_CHROME_ATTRIBUTE]: "canvas" } : {}),
  };
}
