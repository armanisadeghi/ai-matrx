// features/agents/agent-sets/types.ts
//
// Types for Agent Sets (Orchestrators). The set itself is an orchestrator agent;
// these types describe the relationship layer that rides on platform.associations.

import type { Json } from "@/types/database.types";
import type { SetAccent } from "./constants";

/** A saved 2D position on the builder canvas. */
export interface CanvasPos {
  x: number;
  y: number;
}

/**
 * Set-level config — carried in the `matrx_set` self-edge `metadata` jsonb.
 * Everything here is presentational/organizational; the set's name + description
 * come from the orchestrator agent row itself.
 */
export interface AgentSetConfig {
  accent?: SetAccent;
  /** Short descriptor shown on the set card + canvas header (overrides nothing on the agent). */
  tagline?: string;
  /** Saved orchestrator node position on the builder canvas. */
  orchestratorPos?: CanvasPos;
}

/**
 * Per-member config — carried in each `member` edge's `metadata` jsonb. This is
 * the user's authored answer to "what does this agent do INSIDE this set."
 */
export interface AgentSetMemberMeta {
  /** Short role title within the set, e.g. "Generator", "Grader". */
  roleTitle?: string;
  /** One line: the gap this member fills. Seeded from the agent's description. */
  gap?: string;
  /** Saved member node position on the builder canvas. */
  pos?: CanvasPos;
}

/** A set summary as returned by the `agent_set_list()` RPC (resolved/camelCased). */
export interface AgentSetSummary {
  orchestratorId: string;
  /** Orchestrator agent name (the set's face). */
  name: string;
  /** Orchestrator agent description. */
  description: string | null;
  /** Optional set-label override; falls back to `name` in the UI. */
  label: string | null;
  config: AgentSetConfig;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One resolved member of a set (its edge + authored role/gap + saved position). */
export interface AgentSetMember {
  edgeId: string;
  agentId: string;
  position: number;
  roleTitle: string | null;
  gap: string | null;
  pos: CanvasPos | null;
}

/** Full builder state for a single set: marker config + ordered members. */
export interface AgentSetDetail {
  orchestratorId: string;
  /** Whether the `matrx_set` marker edge exists — false means "not a set yet". */
  exists: boolean;
  label: string | null;
  config: AgentSetConfig;
  members: AgentSetMember[];
}

/** Raw row shape returned by the `agent_set_list()` RPC (snake_case from PG). */
export interface AgentSetListRow {
  orchestrator_id: string;
  name: string;
  description: string | null;
  set_label: string | null;
  metadata: Json;
  member_count: number;
  created_at: string;
  updated_at: string;
}
