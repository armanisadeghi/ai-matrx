/**
 * createInstanceFull — atomic instance creation action.
 *
 * The creation mirror of `destroyInstance`: ONE action that every instance
 * slice handles via `extraReducers`, initializing its per-conversation entry in
 * a SINGLE store mutation (one Immer pass, one `useSyncExternalStore`
 * notification, one React commit). This replaces the legacy ~9-dispatch fan-out
 * in `createManualInstance`, which re-rendered every subscribed component once
 * per init action because react-redux re-renders subscribers on EVERY store
 * mutation (to avoid tearing) and does not batch across them.
 *
 * A slice initializes its part only when the corresponding bundle is present
 * (e.g. `overrides` is omitted for Agent-Builder manual mode, which reads
 * `agent.settings` live and must never seed the overrides slice). Slices with
 * no per-instance config (resources, context) always init their empty entry.
 *
 * Defined as a standalone `createAction` (not a slice reducer) so all nine
 * slices — including `conversations` — can listen symmetrically without an
 * import cycle: slices import this value; this module imports only TYPES from
 * the slices (erased at runtime).
 */

import { createAction } from "@reduxjs/toolkit";
import type {
  AgentType,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type {
  ApiEndpointMode,
  InstanceOrigin,
  SourceFeature,
} from "@/features/agents/types/instance.types";
import type { InitInstanceUIStatePayload } from "./instance-ui-state/instance-ui-state.slice";

export interface CreateInstanceFullPayload {
  // ── Conversation record (conversations slice) ───────────────────────────────
  conversationId: string;
  agentId: string;
  agentType: AgentType;
  origin: InstanceOrigin;
  sourceFeature?: SourceFeature;
  shortcutId?: string;
  initialAgentVersionId?: string | null;
  isEphemeral?: boolean;

  // ── Per-slice init bundles — omit a bundle to skip that slice's init ─────────
  /** Omit for manual mode (Agent Builder reads agent.settings live). */
  overrides?: { baseSettings?: Partial<FeLlmParams> };
  variables?: {
    definitions?: VariableDefinition[];
    scopeValues?: Record<string, unknown>;
  };
  userInput?: {
    text?: string;
    lastSubmittedText?: string;
    lastSubmittedUserValues?: Record<string, unknown>;
    originalSubmittedText?: string;
    originalSubmittedUserValues?: Record<string, unknown>;
  };
  clientTools?: { tools?: string[] };
  /** The full instance-ui-state init payload, minus the conversationId. */
  uiState?: Omit<InitInstanceUIStatePayload, "conversationId">;
  messages?: { apiEndpointMode?: ApiEndpointMode };
}

export const createInstanceFull = createAction<CreateInstanceFullPayload>(
  "instances/createInstanceFull",
);
