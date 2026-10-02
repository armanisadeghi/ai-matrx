/**
 * ONE MEANING PER STATE (settings-translation F-b, owner 2026-10-02: "the
 * difference between something being set to none and something not being
 * included at all").
 *
 * For these keys the house "auto" posture IS the unset state on the server:
 *   - reasoning_effort — aidream `matrx_ai/catalog/canonicalize.py` normalizes
 *     "auto" to None before any rule or processor sees it (ai_041).
 *   - visualization — the Google research agent reads an unset value as "auto"
 *     (`providers/google/google_research_agent.py`).
 * So a control that offers "auto" for one of them must CLEAR the key, never
 * save the word: a saved "auto" and an absent key would be two stored states
 * with one meaning. Keys whose "auto" is a real provider value that goes on the
 * wire (render_quality, background, moderation, reasoning_summary) are NOT here.
 *
 * Every settings writer reads this one rule: the agent builder
 * (AgentSettingsCore), the per-run overrides panel (RunConfigOverrides), the
 * comparison column editor, and the wire selector.
 */

export const AUTO_VALUE = "auto";

export const AUTO_MEANS_UNSET_KEYS: ReadonlySet<string> = new Set([
  "reasoning_effort",
  "visualization",
]);

/** True when writing `value` to `key` means "not set" — the key is removed. */
export function isUnsetChoice(key: string, value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return value === AUTO_VALUE && AUTO_MEANS_UNSET_KEYS.has(key);
}
