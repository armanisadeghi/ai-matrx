/**
 * features/administration/hindsight/subject-doors.ts
 *
 * The Door Law for Hindsight: every record this surface names must be
 * openable. Subjects (agent / workflow / tool), the real examples a review
 * read, the reviewer's own run, and every replay conversation all get a door.
 *
 * `environment` subjects have no record door on purpose — an environment is a
 * conversation SELECTOR (`conversation_type` / `source_app` / `source_feature`),
 * not a row. Its transcripts are reachable the honest way: each review lists
 * the exact conversations it read, and each one opens.
 */
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";

import type { Enrollment } from "./types";

export function agentHref(agentId: string): string {
  return `/administration/agents/system-agents/agents/${agentId}`;
}

export function conversationHref(conversationId: string): string {
  return `/administration/chat/cx-dashboard/conversations/${conversationId}`;
}

export function toolHref(toolId: string): string {
  return `/administration/agents/mcp-tools/${toolId}`;
}

export function workflowHref(definitionId: string): string {
  return `${WORKFLOWS_APP_URL}/workflows/${definitionId}`;
}

export function workflowRunHref(runId: string): string {
  return `${WORKFLOWS_APP_URL}/runs/${runId}`;
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
): Door | null {
  const { subject_kind: kind, subject_id: id } = enrollment;
  if (kind === "agent" && id) {
    return { href: agentHref(id), label: "Open agent", external: false };
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
export function exampleDoor(kind: string, id: string): Door | null {
  if (kind === "conversation") {
    return { href: conversationHref(id), label: "Open transcript", external: false };
  }
  if (kind === "wf_run") {
    return { href: workflowRunHref(id), label: "Open run", external: true };
  }
  return null;
}
