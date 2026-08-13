/**
 * Canonical names for the `matrx-user/agent-settings` surface.
 *
 * Three modules have to agree on these strings and none of them may re-type
 * one: the manifest declares the surface and its write target, the window
 * mounts the provider under the surface name, and `AgentSettingsForm` registers
 * the handler under the target name from two levels down. A typo in any of them
 * is a target that is declared but never handled — which fails loudly at apply
 * time by design, but only once a real agent run reaches it.
 *
 * Lives in `constants/` rather than beside the window because the manifest
 * imports it, and manifests are loaded by `scripts/check-surface-drift.ts`
 * outside any React/Next runtime.
 */

/** `ui_surface.name` — byte-identical to the manifest's `surfaceName`. */
export const AGENT_SETTINGS_SURFACE_NAME = "matrx-user/agent-settings";

/**
 * The surface's one write target.
 *
 * Named `settings_` rather than the bare `catalog_profile`, and deliberately
 * NOT sharing `agent-advanced-editor`'s `editor_catalog_profile`, for the
 * reason spelled out in `features/agents/surface-catalog-profile.ts`: both are
 * floating windows that can be open at once on DIFFERENT agents, and
 * `applySurfaceWrite` resolves a bare name deepest-first, so a shared name
 * would stage the rewrite into whichever window happened to be on top. The
 * contract behind the two names is one shared definition; only the address
 * differs.
 */
export const SETTINGS_CATALOG_PROFILE_TARGET = "settings_catalog_profile";
