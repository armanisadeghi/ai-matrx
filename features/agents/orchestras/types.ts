// features/agents/orchestras/types.ts
//
// Types for Orchestras (Orchestrators). The Orchestra itself is an orchestrator agent;
// these types describe the relationship layer that rides on platform.associations.

import type { Json } from "@/types/database.types";
import type { OrchestraAccent } from "./constants";

/** A saved 2D position on the builder canvas. */
export interface CanvasPos {
  x: number;
  y: number;
}

/**
 * Orchestra-level config — carried in the `orchestra` self-edge `metadata` jsonb.
 * Everything here is presentational/organizational; the Orchestra's name + description
 * come from the orchestrator agent row itself.
 */
export interface OrchestraConfig {
  accent?: OrchestraAccent;
  /** Short descriptor shown on the Orchestra card + canvas header (overrides nothing on the agent). */
  tagline?: string;
  /** Saved orchestrator node position on the builder canvas. */
  orchestratorPos?: CanvasPos;
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
   * Designated member (C-26): the orchestrator MUST successfully consult this
   * member before finishing. Enforced by the server runtime (course-correction
   * + a forced turn; a run that still skips it is never marked complete).
   */
  required?: boolean;
}

/** A Orchestra summary as returned by the `orchestra_list()` RPC (resolved/camelCased). */
export interface OrchestraSummary {
  orchestratorId: string;
  /** Orchestrator agent name (the Orchestra's face). */
  name: string;
  /** Orchestrator agent description. */
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
  /** Designated member (C-26): must be consulted before the orchestrator finishes. */
  required: boolean;
}

/** Full builder state for a single Orchestra: marker config + ordered members. */
export interface OrchestraDetail {
  orchestratorId: string;
  /** Whether the `orchestra` marker edge exists — false means "not an Orchestra yet". */
  exists: boolean;
  label: string | null;
  config: OrchestraConfig;
  members: OrchestraMember[];
}

/** Raw row shape returned by the `orchestra_list()` RPC (snake_case from PG). */
export interface OrchestraListRow {
  orchestrator_id: string;
  name: string;
  description: string | null;
  set_label: string | null;
  metadata: Json;
  member_count: number;
  created_at: string;
  updated_at: string;
}
