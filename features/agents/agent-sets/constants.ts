// features/agents/agent-sets/constants.ts
//
// Agent Sets (Orchestrators) — canonical tokens for the platform.associations
// edges that model a set. There is NO agent_set table: a "set" is an
// orchestrator agent (agent.definition row) PLUS association edges. See
// features/agents/docs/AGENT_SETS.md.

/** Entity-type token for an agent (platform.entity_types.token → agent.definition). */
export const AGENT_TOKEN = "agent" as const;

/**
 * Role of the self-edge (agent:X) → (agent:X) that marks agent X as an
 * orchestrator / set root. Its `metadata` holds set-level config (accent,
 * tagline, saved canvas position) and its existence lets an EMPTY set persist.
 * Distinct role from MEMBER_ROLE so the two never collide on the
 * (source, target, role) unique key, and so clearing members never touches it.
 */
export const SET_MARKER_ROLE = "matrx_set" as const;

/** Role of an orchestrator → member edge. Members are ordered by `position`. */
export const MEMBER_ROLE = "member" as const;

/**
 * Accent palette for a set's identity. Keys are stored in the set config
 * (`AgentSetConfig.accent`); each maps to a Tailwind-friendly gradient + ring
 * resolved in the UI (see agent-sets/components/accents.ts). Semantic, themeable,
 * never raw hex in product UI.
 */
export const SET_ACCENTS = [
  "violet",
  "blue",
  "emerald",
  "amber",
  "rose",
  "cyan",
  "fuchsia",
  "indigo",
] as const;

export type SetAccent = (typeof SET_ACCENTS)[number];

export const DEFAULT_SET_ACCENT: SetAccent = "violet";
