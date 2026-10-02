/**
 * WEB_TOOL_UI_SURFACE — the single canonical `tool_ui.surface_name` for this
 * web app. The runtime fetch (`fetchToolRendererRow`) reads ONLY this surface,
 * and the admin authoring API writes to it by default, so author → render is
 * coherent end-to-end. A renderer authored anywhere else (e.g. the legacy
 * `chrome-extension/pilot` rows, or matrx-extend's surface) is invisible here.
 *
 * Pure constant — no React/client imports — so it's safe to import from both
 * client components and server API routes.
 */
export const WEB_TOOL_UI_SURFACE = "matrx-default/default";
