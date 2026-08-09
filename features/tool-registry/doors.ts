/**
 * THE DOOR LAW for the tool registry (common-docs/policies/no-dead-ends.md).
 *
 * Every record these consoles name — a tool, an MCP server, a bundle — has an
 * id and a destination, but only the TOOL had a route leaf on disk. The other
 * two consoles hold their selection in React state, so an MCP server or a
 * bundle could be named, counted and depended on with no way to reach it:
 *
 *   - `McpToolsManager` and `ToolViewPage` both linked a managed tool's server
 *     at `/administration/agents/mcp-servers/<id>` — **a route leaf that does
 *     not exist**. Both were live 404s (verified against `app/(admin)/…`,
 *     which has only `mcp-servers/page.tsx`).
 *   - a bundle's own console could not be linked at all, so a bundle named
 *     anywhere else was plain text.
 *
 * The fix is the `?feedback=` shape already proven in
 * `app/(admin)/administration/users/feedback/doors.ts`: one deep-link param on
 * the console's own route, read on mount and kept in step with the selection.
 * Declared once here so no surface hand-writes a query string — and so the
 * console and its callers can never disagree about the param name.
 *
 * These are ADMIN routes behind the super-admin `(admin)` layout, which is why
 * none of them belongs in `entityRegistry.ts` as an `hrefFor`: a door that 403s
 * for most users is its own dead end. Admin surfaces pass these builders to
 * `EntityRef` / `MatrxUuidCell` as an explicit `href` override instead.
 */

// ─── Tools (`tool.definition`) ───────────────────────────────────────────────

export const TOOLS_CONSOLE_ROUTE = "/administration/agents/mcp-tools";

/** The tool's detail page (overview + samples). */
export function toolHref(toolId: string): string {
  return `${TOOLS_CONSOLE_ROUTE}/${encodeURIComponent(toolId)}`;
}

/** The tool's UI-component page — where its `tool.ui` rows live. */
export function toolUiHref(toolId: string): string {
  return `${toolHref(toolId)}/ui`;
}

/** The tool's UI incident log. */
export function toolIncidentsHref(toolId: string): string {
  return `${toolHref(toolId)}/incidents`;
}

/** The tool's editor. */
export function toolEditHref(toolId: string): string {
  return `${toolHref(toolId)}/edit`;
}

// ─── MCP servers (`tool.mcp_server`) ─────────────────────────────────────────

export const MCP_SERVERS_CONSOLE_ROUTE = "/administration/agents/mcp-servers";

/** Search param `McpServersAdminPage` reads to select one server. */
export const MCP_SERVER_DEEP_LINK_PARAM = "server";

/**
 * Canonical link to one MCP server. Accepts the server's `id` OR its `slug` —
 * the console matches either, because `tool.definition.managed_by_server_id`
 * carries the id while the console's own list is keyed by slug.
 */
export function mcpServerHref(idOrSlug: string): string {
  return `${MCP_SERVERS_CONSOLE_ROUTE}?${MCP_SERVER_DEEP_LINK_PARAM}=${encodeURIComponent(idOrSlug)}`;
}

// ─── Bundles (`tool.bundle`) ─────────────────────────────────────────────────

export const BUNDLES_CONSOLE_ROUTE = "/administration/agents/bundles";

/** Search param `BundlesAdminPage` reads to select one bundle. */
export const BUNDLE_DEEP_LINK_PARAM = "bundle";

/** Canonical link to one bundle. */
export function bundleHref(bundleId: string): string {
  return `${BUNDLES_CONSOLE_ROUTE}?${BUNDLE_DEEP_LINK_PARAM}=${encodeURIComponent(bundleId)}`;
}
