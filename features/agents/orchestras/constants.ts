// features/agents/orchestras/constants.ts
//
// Orchestras — canonical tokens for the platform.associations edges that model
// an Orchestra. There is NO orchestra table, ever: an Orchestra is an
// orchestrator agent (agent.definition row) PLUS association edges. See
// features/agents/docs/ORCHESTRAS.md.

/** Entity-type token for an agent (platform.entity_types.token → agent.definition). */
export const AGENT_TOKEN = "agent" as const;

/**
 * Role of the self-edge (agent:X) → (agent:X) that marks agent X as an
 * orchestrator / Orchestra root. Its `metadata` holds Orchestra-level config
 * (accent, tagline, saved canvas position) and its existence lets an EMPTY
 * Orchestra persist. Distinct role from MEMBER_ROLE so the two never collide on
 * the (source, target, role) unique key, and so clearing members never touches it.
 */
export const ORCHESTRA_MARKER_ROLE = "orchestra" as const;

/**
 * True for the marker role. The pre-rename value ("matrx_set", from when this
 * system was called "Agent Set") is GONE — all 10 live rows were migrated on
 * 2026-08-15 and verified at zero, so the tolerant-read window is closed and
 * this is now a plain equality check.
 */
export function isOrchestraMarkerRole(role: string | null | undefined): boolean {
  return role === ORCHESTRA_MARKER_ROLE;
}

/** Role of an orchestrator → member edge. Members are ordered by `position`. */
export const MEMBER_ROLE = "member" as const;

/**
 * Accent palette for an Orchestra's identity. Keys are stored in its config
 * (`OrchestraConfig.accent`); each maps to a Tailwind-friendly gradient + ring
 * resolved in the UI (see orchestras/components/accents.ts). Semantic, themeable,
 * never raw hex in product UI.
 */
export const ORCHESTRA_ACCENTS = [
  "violet",
  "blue",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "fuchsia",
  "indigo",
] as const;

export type OrchestraAccent = (typeof ORCHESTRA_ACCENTS)[number];

export const DEFAULT_ORCHESTRA_ACCENT: OrchestraAccent = "violet";
