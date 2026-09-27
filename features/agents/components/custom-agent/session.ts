// features/agents/components/custom-agent/session.ts
//
// What one "Custom agent…" open captured: the menu's scope (it may hold
// structures Redux must not carry), the values offered for mapping, and the
// apply target when the text can be saved back. Only the session id travels
// through overlay data; the window releases the session when it closes.

import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { CustomAgentValueSource } from "./custom-agent-plan";

export interface CustomAgentSession {
  scope: ApplicationScope | null;
  sources: CustomAgentValueSource[];
  sourceTitle: string | null;
  /** Set when an answer can be applied back to the text (review/applyTargets). */
  applyTargetId: string | null;
}

const sessions = new Map<string, CustomAgentSession>();
let seq = 0;

export function registerCustomAgentSession(session: CustomAgentSession): string {
  seq += 1;
  const id = `custom-agent-${seq}`;
  sessions.set(id, session);
  return id;
}

export function getCustomAgentSession(id: string | null | undefined): CustomAgentSession | null {
  return id ? (sessions.get(id) ?? null) : null;
}

export function releaseCustomAgentSession(id: string | null | undefined): void {
  if (id) sessions.delete(id);
}
