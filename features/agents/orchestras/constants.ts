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

/**
 * How the Orchestra RUNS its members (stored in `OrchestraConfig.mode` on the
 * marker edge — the aidream runtime reads it per run). "supervisor" projects
 * members as tools the orchestrator calls; the other three compile to a
 * deterministic plan run on the server (D-36). An unknown value fails loudly
 * server-side — never silently degrades to a memberless run.
 */
export const ORCHESTRA_MODES = ["supervisor", "sequential", "parallel", "dag"] as const;

export type OrchestraMode = (typeof ORCHESTRA_MODES)[number];

export const DEFAULT_ORCHESTRA_MODE: OrchestraMode = "supervisor";

/** Non-technical labels/descriptions for the mode picker (the user builds
 * expertise systems — they don't know what a DAG is, and shouldn't need to). */
export const ORCHESTRA_MODE_META: Record<OrchestraMode, { label: string; description: string }> = {
  supervisor: {
    label: "Supervisor",
    description: "The orchestrator decides which members to bring in, and weaves their answers together.",
  },
  sequential: {
    label: "Pipeline",
    description: "Members work in order — each one builds on the previous member's output.",
  },
  parallel: {
    label: "Panel",
    description: "All members work at the same time; the orchestrator combines their answers.",
  },
  dag: {
    label: "Custom flow",
    description: "Members run according to the dependencies set on their connections.",
  },
};

/**
 * Delegation depth (D-39): how many levels deep team members may bring in
 * their own helper agents. Stored as `depth_budget` on the marker edge's
 * metadata jsonb — the aidream runtime enforces it per run. Absent = the
 * platform standard. Bounds mirror the server
 * (aidream/services/orchestras/models.py DEPTH_BUDGET_MIN/MAX); change in
 * lockstep.
 */
export const ORCHESTRA_DEPTH_BUDGET_MIN = 1;
export const ORCHESTRA_DEPTH_BUDGET_MAX = 5;
/** The platform standard when the Orchestra declares nothing (mirrors
 * matrx-ai's PROJECTED_AGENT_MAX_RECURSION_DEPTH). */
export const DEFAULT_ORCHESTRA_DEPTH_BUDGET = 2;

export function isOrchestraDepthBudget(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= ORCHESTRA_DEPTH_BUDGET_MIN &&
    value <= ORCHESTRA_DEPTH_BUDGET_MAX
  );
}

export function isOrchestraMode(value: unknown): value is OrchestraMode {
  return typeof value === "string" && (ORCHESTRA_MODES as readonly string[]).includes(value);
}

/**
 * How ONE member's result comes back to the orchestrator (D-40). Stored as
 * `result_mode` on the MEMBER edge's metadata jsonb; the aidream runtime puts
 * it straight onto the projected tool (`AgentToolSpec.result_mode`) and
 * strict-parses it — an unknown value fails the run loudly rather than
 * silently running the member inline. Mirrors
 * aidream/services/orchestras/models.py RESULT_MODES; change in lockstep.
 */
export const ORCHESTRA_RESULT_MODES = ["inline", "reference", "inline_once"] as const;

export type OrchestraResultMode = (typeof ORCHESTRA_RESULT_MODES)[number];

export const DEFAULT_ORCHESTRA_RESULT_MODE: OrchestraResultMode = "inline";

/** Non-technical labels for the member result-routing control. The Creator is
 * a subject-matter expert, not an engineer: this is about whether the leader
 * READS the member's answer or just passes it along. */
export const ORCHESTRA_RESULT_MODE_META: Record<
  OrchestraResultMode,
  { label: string; description: string }
> = {
  inline: {
    label: "Read it",
    description:
      "The orchestrator receives this member's full answer and reasons over it. Best when it has to judge, correct, or weave the answer into its own.",
  },
  reference: {
    label: "Pass it along without reading it",
    description:
      "The answer is stored and the orchestrator gets only a short label for it — it can hand it to another member or return it, without spending its own context on the content. Best for long documents, transcripts, and data.",
  },
  inline_once: {
    label: "Read it once, then keep only the label",
    description:
      "The orchestrator reads the full answer this turn, then keeps only a short label for it afterwards. Best when it needs the content once to decide something.",
  },
};

export function isOrchestraResultMode(value: unknown): value is OrchestraResultMode {
  return (
    typeof value === "string" && (ORCHESTRA_RESULT_MODES as readonly string[]).includes(value)
  );
}
