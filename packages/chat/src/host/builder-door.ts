/**
 * host/builder-door — the agent BUILDER's write thunks, reached from the chat package's
 * agent headers (options menu, save action, lifecycle actions, duplicate flow).
 *
 * The builder owns these writes (matrx-frontend: features/agents/redux/builder-tier.thunks.ts);
 * the package draws the controls and must not import them (PACKAGE-INDEPENDENCE.md P25).
 * The host registers once at startup (`registerBuilderDoor`, providers/chatUiRegistration.ts).
 * A bare host registers nothing: `getBuilderDoor()` answers null and reports ONCE through the
 * host diagnostics port, and every control that needs the door is ABSENT — never a button that
 * does nothing (Law 4).
 */

import type { AsyncThunkAction } from "@reduxjs/toolkit";
import { reportUnregisteredHostSlot } from "./diagnostics";
import type { ChatDispatch, ChatRootState } from "../store/root-state";
import type { AgentDefinition } from "../agents/types/agent-definition.types";

type Cfg = { dispatch: ChatDispatch; state: ChatRootState };
type Door<Arg, Ret> = (arg: Arg) => AsyncThunkAction<Ret, Arg, Cfg>;

interface DuplicateAgentCommon {
  asSystem?: boolean;
  organizationId?: string;
  followsSource?: boolean;
}

/**
 * What to copy into a new agent: the agent as it is now (`agentId`), or one
 * exact saved version (`versionId`, an agent.definition_version id — its
 * snapshot is copied, never the possibly-newer master).
 */
export type DuplicateAgentOptions = DuplicateAgentCommon &
  ({ agentId: string; versionId?: string } | { agentId?: string; versionId: string });

export type CreateAgentInput = Partial<
  Omit<
    AgentDefinition,
    | "id"
    | "createdBy"
    | "createdAt"
    | "updatedAt"
    | "isVersion"
    | "parentAgentId"
    | "version"
    | "changedAt"
    | "changeNote"
  >
>;

export interface BuilderDoor {
  saveAgent: Door<string, void>;
  saveAgentField: Door<
    { agentId: string; field: keyof AgentDefinition; value: AgentDefinition[keyof AgentDefinition] },
    void
  >;
  createAgent: Door<CreateAgentInput, string>;
  deleteAgent: Door<string, void>;
  duplicateAgent: Door<string | DuplicateAgentOptions, string>;
  setAgentFavorite: Door<{ agentId: string; isFavorite: boolean }, void>;
}

let door: BuilderDoor | null = null;

/** The host's registration (idempotent). */
export function registerBuilderDoor(next: BuilderDoor): void {
  door = next;
}

/** Test seam: forget the registration. */
export function resetBuilderDoorForTests(): void {
  door = null;
}

/** The registered builder door, or null (reported once: the agent builder's controls are absent here). */
export function getBuilderDoor(): BuilderDoor | null {
  if (!door) {
    reportUnregisteredHostSlot("builder", "the agent options, save and lifecycle controls are absent");
  }
  return door;
}

/** The door, for a handler that only runs when the control was drawn (so the door was present). */
export function requireBuilderDoor(): BuilderDoor {
  const d = getBuilderDoor();
  if (!d) throw new Error('The host registered no "builder" door for the chat package (registerBuilderDoor).');
  return d;
}
