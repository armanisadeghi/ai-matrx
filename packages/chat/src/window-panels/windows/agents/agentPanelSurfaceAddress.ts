/**
 * The page surface an agent panel is bound to, carried in its `?panels=` token.
 *
 * A conversation launched from a page's Agents menu is stamped with that
 * page's surface (`conversation.surfaceName`), and every send re-reads the
 * surface's live values through `refreshSurfaceScope` — that is how the agent
 * sees the cell the person has selected NOW. The stamp lived only in Redux, so
 * a reload restored the window from `?panels=agent:<id>:m-<mode>` with no
 * stamp: the next turn went out with NO `context` at all and the agent said
 * "the context is gone this turn" (conversation 1794b8fa…, 2026-09-26).
 *
 * So the address carries the binding: the shell that mints the token writes
 * `s-<surface name>` whenever its conversation is bound, and the hydrator that
 * restores it stamps the same surface back — a restored window is bound to the
 * page exactly like the fresh one was, and an unbound one stays unbound.
 *
 * Surface names are `<client>/<local>` kebab (`matrx-user/data-tables`): no
 * `_`, `:` or `,`, so they survive the token grammar (pairs joined by `_`,
 * split on the FIRST `-`).
 */
export const AGENT_PANEL_SURFACE_ARG = "s";

const SURFACE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

/** The `?panels=` args for an agent display-mode shell. */
export function agentPanelUrlArgs(
  mode: string,
  surfaceName: string | null | undefined,
): Record<string, string> {
  return surfaceName && SURFACE_NAME_PATTERN.test(surfaceName)
    ? { m: mode, [AGENT_PANEL_SURFACE_ARG]: surfaceName }
    : { m: mode };
}

/** The surface a restored token names, or null when it names none (or junk). */
export function readAgentPanelSurfaceArg(
  args: Record<string, string>,
): string | null {
  const value = args[AGENT_PANEL_SURFACE_ARG];
  return value && SURFACE_NAME_PATTERN.test(value) ? value : null;
}
