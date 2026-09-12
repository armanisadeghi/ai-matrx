/**
 * features/hindsight/subject-doors.ts
 *
 * The Door Law for Hindsight: every record this surface names must be
 * openable. Subjects (agent / orchestra / workflow / tool), the real examples a
 * review read, the reviewer's own run, and every replay conversation all get a
 * door.
 *
 * `environment` subjects have no record door on purpose — an environment is a
 * conversation SELECTOR (`conversation_type` / `source_app` / `source_feature`),
 * not a row. Its transcripts are reachable the honest way: each review lists
 * the exact conversations it read, and each one opens.
 */
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { runHref } from "@/features/workflow-runtime/run-doors";
import { agentPathFor } from "@/features/agents/addressing/agentAddress";

import type { Enrollment } from "./types";

/**
 * Who is looking. The admin console opens records through /administration/*;
 * the product surface (a user's own agent's Hindsight tab) opens the same
 * records through routes a non-admin can reach.
 */
export type DoorAudience = "admin" | "product";

/**
 * Where an agent opens.
 *
 * 🚨 AUDIENCE DOES NOT DECIDE THIS — the agent's KIND does. This function used
 * to answer purely from `audience`, so a personal agent named on an admin
 * Hindsight surface linked into the System Agents shell and a builtin named on
 * the product surface linked into `/agents`, where it does not exist. The one
 * address rule lives in `features/agents/addressing/agentAddress.ts`.
 *
 * `agentType` is `agent.definition.agent_type`. Pass it whenever the caller
 * holds the row. When it is genuinely unknown the caller must resolve it
 * (`useAgentHref`) rather than call this — `audience` is kept only so the
 * remaining callers compile while they are converted, and it decides nothing.
 */
export function agentHref(
  agentId: string,
  agentType: string | null = null,
): string {
  return agentPathFor({ agentId, agentType });
}

export function conversationHref(
  conversationId: string,
  audience: DoorAudience = "admin",
): string {
  return audience === "admin"
    ? `/administration/chat/cx-dashboard/conversations/${conversationId}`
    : `/chat/${conversationId}`;
}

export function toolHref(toolId: string): string {
  return `/administration/agents/mcp-tools/${toolId}`;
}

/**
 * An Orchestra has no table — it IS the conductor agent plus its member
 * edges — so its identity is the conductor's id and its door is the
 * Orchestra builder, which is where the roster the reviewer read actually
 * lives. Opening the plain agent page instead would hide the members, which
 * are the whole reason this subject kind exists.
 */
export function orchestraHref(conductorId: string): string {
  return `/agents/orchestras/${conductorId}`;
}

export function workflowHref(definitionId: string): string {
  return `${WORKFLOWS_APP_URL}/workflows/${definitionId}`;
}

/**
 * A run is read in THIS app (wall W36, 2026-09-12): `/workflows/runs/{id}`
 * rebuilds a finished run from its durable event log — the showcase, the
 * deliverables and the honest failure card — so a reviewer's example never
 * bounces the reader into the author's Studio on another host.
 */
export function workflowRunHref(runId: string): string {
  return runHref(runId);
}

export interface Door {
  href: string;
  label: string;
  /** External hosts open in a new tab; same-origin routes navigate in place. */
  external: boolean;
}

/**
 * The door for an enrollment's subject. Tool subjects are stored by NAME, so
 * the caller resolves `tool.definition.id` and passes it in.
 */
export function subjectDoor(
  enrollment: Enrollment,
  toolId?: string | null,
  audience: DoorAudience = "admin",
  /** `agent_type` of the subject agent, when the caller holds the row. */
  agentType: string | null = null,
): Door | null {
  const { subject_kind: kind, subject_id: id } = enrollment;
  if (kind === "agent" && id) {
    return { href: agentHref(id, agentType), label: "Open agent", external: false };
  }
  if (kind === "orchestra" && id) {
    return { href: orchestraHref(id), label: "Open orchestra", external: false };
  }
  if (kind === "workflow" && id) {
    return { href: workflowHref(id), label: "Open workflow", external: true };
  }
  if (kind === "tool" && toolId) {
    return { href: toolHref(toolId), label: "Open tool", external: false };
  }
  return null;
}

/** The door for one real example a review read. */
export function exampleDoor(
  kind: string,
  id: string,
  audience: DoorAudience = "admin",
): Door | null {
  if (kind === "conversation") {
    return {
      href: conversationHref(id, audience),
      label: "Open transcript",
      external: false,
    };
  }
  if (kind === "wf_run") {
    return { href: workflowRunHref(id), label: "Open run", external: false };
  }
  return null;
}
