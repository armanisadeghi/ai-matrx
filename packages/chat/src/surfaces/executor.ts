/**
 * Surface executors — who runs a page's browser-side tools.
 *
 * OWNER RULING (Arman, 2026-10-04): every page declares its executor. Use the
 * web app's central executor and build on top of it, or bring your own — but a
 * page never has none. The server reads `ui.ui_surface.executor_name` to decide
 * which tools the client runs; with no executor it disables every client-run
 * tool for the whole request.
 *
 * `SurfaceManifest.executor` is REQUIRED and typed against these names (the
 * `tool.executor` rows that are runtimes, not MCP servers). The manifest sync
 * writes it to `ui_surface.executor_name`; `pnpm check:surface-executors`
 * fails on a mirror row that disagrees or has none.
 */

/** `tool.executor.name` values a surface may run on. */
export type SurfaceExecutorName =
  /** The web app (Next.js) — this app's central executor. */
  | "matrx-user"
  /** Web-app add-on (parent `matrx-user`): widget_* tools on the focused editor. */
  | "matrx-user.widget-handle"
  | "chrome-extension"
  | "matrx-local"
  /** Server runtimes — no client-run tools. */
  | "aidream"
  | "matrx-ai-core";

/** The web app's central executor. Every page of this app names it unless it brings its own. */
export const MATRX_WEB_APP_EXECUTOR = "matrx-user" as const satisfies SurfaceExecutorName;

export const SURFACE_EXECUTOR_NAMES: readonly SurfaceExecutorName[] = [
  "matrx-user",
  "matrx-user.widget-handle",
  "chrome-extension",
  "matrx-local",
  "aidream",
  "matrx-ai-core",
];
