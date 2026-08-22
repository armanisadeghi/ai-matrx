// features/agents/orchestras/types.ts
//
// Types for Orchestras (Conductors). The Orchestra itself is an conductor agent;
// these types describe the relationship layer that rides on platform.associations.

import type { Json } from "@/types/database.types";
import type { OrchestraAccent, OrchestraMode, OrchestraResultMode } from "./constants";

/** A saved 2D position on the builder canvas. */
export interface CanvasPos {
  x: number;
  y: number;
}

/**
 * Orchestra-level config — carried in the `orchestra` self-edge `metadata` jsonb.
 * Everything here is presentational/organizational; the Orchestra's name + description
 * come from the conductor agent row itself.
 */
export interface OrchestraConfig {
  accent?: OrchestraAccent;
  /** Short descriptor shown on the Orchestra card + canvas header (overrides nothing on the agent). */
  tagline?: string;
  /** Saved conductor node position on the builder canvas. */
  conductorPos?: CanvasPos;
  /**
   * How the Orchestra runs its members. Absent = "supervisor". The aidream
   * runtime honors this per run: supervisor projects members as tools; the
   * compiled modes (sequential/parallel/dag) run as a deterministic plan.
   */
  mode?: OrchestraMode;
  /**
   * Delegation depth (D-39): how many levels deep members may bring in their
   * own helper agents. Absent = the platform standard (2). Written to the
   * marker metadata as `depth_budget`; the aidream runtime validates the
   * declared value loudly and enforces it per run.
   */
  depthBudget?: number;
}

/**
 * Per-member config — carried in each `member` edge's `metadata` jsonb. This is
 * the user's authored answer to "what does this agent do INSIDE this Orchestra."
 */
export interface OrchestraMemberMeta {
  /** Short role title within the Orchestra, e.g. "Generator", "Grader". */
  roleTitle?: string;
  /** One line: the gap this member fills. Seeded from the agent's description. */
  gap?: string;
  /** Saved member node position on the builder canvas. */
  pos?: CanvasPos;
  /**
   * Designated member (C-26): the conductor MUST successfully consult this
   * member before finishing. Enforced by the server runtime (course-correction
   * + a forced turn; a run that still skips it is never marked complete).
   */
  required?: boolean;
  /**
   * How this member's result comes back to the conductor (D-40). Absent =
   * "inline". `reference` is the routing-without-holding behaviour the
   * Orchestra is built on: the answer goes to the conversation value store and
   * the conductor holds only a descriptor. Written to the edge metadata as
   * `result_mode` (wire key); the server strict-parses it.
   */
  resultMode?: OrchestraResultMode;
}

/** A Orchestra summary as returned by the `orchestra_list()` RPC (resolved/camelCased). */
export interface OrchestraSummary {
  conductorId: string;
  /** Conductor agent name (the Orchestra's face). */
  name: string;
  /** Conductor agent description. */
  description: string | null;
  /** Optional Orchestra-label override; falls back to `name` in the UI. */
  label: string | null;
  config: OrchestraConfig;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One resolved member of an Orchestra (its edge + authored role/gap + saved position). */
export interface OrchestraMember {
  edgeId: string;
  agentId: string;
  position: number;
  roleTitle: string | null;
  gap: string | null;
  pos: CanvasPos | null;
  /** Designated member (C-26): must be consulted before the conductor finishes. */
  required: boolean;
  /** How its result comes back (D-40). Always resolved — "inline" by default. */
  resultMode: OrchestraResultMode;
}

/** Full builder state for a single Orchestra: marker config + ordered members. */
export interface OrchestraDetail {
  conductorId: string;
  /** Whether the `orchestra` marker edge exists — false means "not an Orchestra yet". */
  exists: boolean;
  label: string | null;
  config: OrchestraConfig;
  members: OrchestraMember[];
}

/** Raw row shape returned by the `orchestra_list()` RPC (snake_case from PG). */
export interface OrchestraListRow {
  conductor_id: string;
  name: string;
  description: string | null;
  label: string | null;
  metadata: Json;
  member_count: number;
  created_at: string;
  updated_at: string;
}
