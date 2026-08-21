import type { LLMParams } from "@/features/agents/types/agent-api-types";

/**
 * Build an instance's `baseSettings` snapshot: the agent's settings PLUS its
 * model folded in as the LLMParams `model` key.
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
 * Frontend input capabilities have their own instance snapshot and MUST NOT be
 * accepted here. That structural boundary makes it impossible for a UI-only
 * value to leak into Python `config_overrides`.
 */
export function buildInstanceBaseSettings(
  settings: Partial<LLMParams> | null | undefined,
  modelId: string | null | undefined,
): Partial<LLMParams> {
  return {
    ...(settings ?? {}),
    ...(modelId ? { model: modelId } : {}),
  };
}
