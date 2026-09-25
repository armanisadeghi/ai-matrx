import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type { ModelUsageResult } from "../types";

const IDENTITY_KEYS = new Set(["model", "model_id"]);

function asSettings(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

/**
 * First-seen value for every settings key across the agents / builtins /
 * templates still pointing at a deprecated model. Identity keys are omitted —
 * the replacement writes `model_id` itself.
 */
export function unionUsageSettings(
  usage: ModelUsageResult | null | undefined,
): FeLlmParams {
  if (!usage) return {} as FeLlmParams;
  const out: Record<string, unknown> = {};
  for (const item of [
    ...usage.promptBuiltins,
    ...usage.agents,
    ...usage.agentTemplates,
  ]) {
    const settings = asSettings(item.settings);
    if (!settings) continue;
    for (const [key, value] of Object.entries(settings)) {
      if (IDENTITY_KEYS.has(key)) continue;
      if (value === undefined || value === null) continue;
      if (!(key in out)) out[key] = value;
    }
  }
  return out as FeLlmParams;
}

function normalizeSettings(settings: FeLlmParams): string {
  const raw = { ...(settings as Record<string, unknown>) };
  delete raw.model;
  delete raw.model_id;
  const sorted = Object.fromEntries(
    Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify(sorted);
}

/** True when the admin kept the current overrides — do not overwrite every row. */
export function settingsUnchanged(
  next: FeLlmParams,
  current: FeLlmParams,
): boolean {
  return normalizeSettings(next) === normalizeSettings(current);
}

/** Every referencing row's own settings — what the swap suggestions read. */
export function usageSettingsList(
  usage: ModelUsageResult | null | undefined,
): Array<Record<string, unknown> | null> {
  if (!usage) return [];
  return [...usage.promptBuiltins, ...usage.agents, ...usage.agentTemplates].map(
    (item) => asSettings(item.settings),
  );
}
