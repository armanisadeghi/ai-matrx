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
 * Pre-rename value of the same self-edge ("Orchestra" → "Orchestra",
 * 2026-08-15). READ-ONLY compatibility: nothing writes this again. Remove it —
 * and `isOrchestraMarkerRole` collapses to an equality check — once a scan of
 * platform.associations confirms zero `matrx_set` rows remain.
 */
export const LEGACY_ORCHESTRA_MARKER_ROLE = "matrx_set" as const;

/** True for the current marker role OR its pre-rename value. Use this for every READ. */
export function isOrchestraMarkerRole(role: string | null | undefined): boolean {
  return role === ORCHESTRA_MARKER_ROLE || role === LEGACY_ORCHESTRA_MARKER_ROLE;
}

/** Role of an orchestrator → member edge. Members are ordered by `position`. */
export const MEMBER_ROLE = "member" as const;

/**
 * Accent palette for an Orchestra's identity. Keys are stored in its config
 * (`OrchestraConfig.accent`); each maps to a Tailwind-friendly gradient + ring
 * resolved in the UI (see agent-sets/components/accents.ts). Semantic, themeable,
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
