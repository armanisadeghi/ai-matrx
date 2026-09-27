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
  // A route is listed only once its page RENDERS ChatCanvasWorkspace: listing
  // a page that does not hides the shell's nav with nothing to replace it.
  // /demos/spatial joins the day it moves off its interim chat|board split.
];

export function isCanvasChromeRoute(pathname: string): boolean {
  return CANVAS_CHROME_ROUTES.some((pattern) => pattern.test(pathname));
}

/** The attribute to spread onto `.shell-root` at SSR. */
export function shellChromeAttributes(pathname: string): Record<string, string> {
  return isCanvasChromeRoute(pathname) ? { [SHELL_CHROME_ATTRIBUTE]: "canvas" } : {};
}
