import type { LLMParams } from "@/features/agents/types/agent-api-types";
import type { UiGates } from "@/lib/redux/slices/agent-settings/ui-gates";

/**
 * Build an instance's `baseSettings` snapshot: the agent's settings PLUS its
 * model folded in as the LLMParams `model` key, PLUS its model-gated UI flags
 * (`uiGates`) flattened in.
 *
 * THE INVARIANT this protects:
 *   Every write path that seeds or updates instance `baseSettings` — the
 *   create-instance snapshot, the builder→instance sync saga, and conversation
 *   reload — MUST route through here so `model` always has a base value.
 *
 *   `model` travels to the backend via `config_overrides.model`, and the API
 *   selector (`selectSettingsOverridesForApi`) only sends a key when it differs
 *   from `baseSettings`. If a write path drops `model` from the base, the model
 *   picker has nothing to diff against, so picking the agent's OWN model ships a
 *   `config_overrides.model` equal to the default — which the backend rejects.
 *
 *   The Builder stores the model separately (agent.modelId), not inside
 *   agent.settings, which is why it must be folded in explicitly.
 *
 * UI GATES — the load-bearing flatten:
 *   The model-gated UI flags (`tools`, `image_urls`, `file_urls`,
 *   `youtube_videos`) MOVED OUT of `agent.settings` into the dedicated FE-only
 *   `agent.uiGates` column. The chat instance is an ephemeral working copy that
 *   NEVER reads the agentDefinition slice (see the override selectors' header),
 *   so we FLATTEN `uiGates` into the snapshot here. `selectAttachmentCapabilities`
 *   then reads `merged.image_urls === true` unchanged, and the API-bound
 *   selectors strip these keys (via `UI_GATE_KEYS`) so they never reach the
 *   server. The persisted agent settings stay clean — the DB `ui_gates` column
 *   is the source of truth.
 */
export function buildInstanceBaseSettings(
  settings: Partial<LLMParams> | null | undefined,
  modelId: string | null | undefined,
  uiGates?: UiGates | null | undefined,
): Partial<LLMParams> {
  return {
    ...(settings ?? {}),
    ...((uiGates ?? {}) as Partial<LLMParams>),
    ...(modelId ? { model: modelId } : {}),
  };
}
