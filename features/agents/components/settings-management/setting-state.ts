/**
 * The three states of one model setting — THE definition every settings
 * surface reads (owner, 2026-10-02: "the difference between something being
 * set to none and something not being included at all").
 *
 *   unset — the key is ABSENT from the saved settings JSON. The model's own
 *           default applies. A person can always return a setting here.
 *   off   — an explicit off value is saved: `false` for a boolean control,
 *           `"none"` for an enum control that declares it (reasoning_effort,
 *           thinking_level, …). The server translates it per model (K6 `off`
 *           in common-docs/projects/settings-translation/CONTRACTS.md) — it is
 *           never the same request as unset.
 *   value — any other saved value.
 *
 * `null` in the saved JSON is treated as unset, and writing unset DELETES the
 * key — the client never stores `null` (or a sentinel like `-1`) to mean
 * "not set".
 */

import type { ControlDefinition } from "@ai-matrx/chat/agents/hooks/useModelControls";

export type SettingState = "unset" | "off" | "value";

/** The enum value that means "off" when a control declares it. */
export const ENUM_OFF_VALUE = "none";

/**
 * The explicit off value this control can save, or `undefined` when the
 * setting has no off (e.g. temperature — 0 is a value, not off).
 */
export function offValueFor(
  control: ControlDefinition | null | undefined,
): boolean | string | undefined {
  if (!control) return undefined;
  if (control.type === "boolean") return false;
  if (control.type === "enum" && control.enum?.includes(ENUM_OFF_VALUE)) {
    return ENUM_OFF_VALUE;
  }
  return undefined;
}

/** True when `value` is an explicit off (boolean false or enum "none"). */
export function isOffValue(
  value: unknown,
  control: ControlDefinition | null | undefined,
): boolean {
  if (value === false) return true;
  if (value === ENUM_OFF_VALUE) {
    // Without a control we still know "none" is the house off posture.
    return !control || control.type === "enum";
  }
  return false;
}

export function settingStateOf(
  settings: Record<string, unknown> | null | undefined,
  key: string,
  control: ControlDefinition | null | undefined,
): SettingState {
  const value = settings?.[key];
  if (value === undefined || value === null) return "unset";
  return isOffValue(value, control) ? "off" : "value";
}

/**
 * Write one setting into a NEW settings object.
 *   unset → the key is removed (never `null`)
 *   off   → the control's off value (no-op when the control has none)
 *   value → `value`
 */
export function withSettingState<T extends Record<string, unknown>>(
  settings: T,
  key: string,
  state: SettingState,
  control: ControlDefinition | null | undefined,
  value?: unknown,
): T {
  if (state === "unset") {
    const { [key]: _removed, ...rest } = settings;
    return rest as T;
  }
  if (state === "off") {
    const off = offValueFor(control);
    if (off === undefined) return settings;
    return { ...settings, [key]: off };
  }
  if (value === undefined || value === null) {
    const { [key]: _removed, ...rest } = settings;
    return rest as T;
  }
  return { ...settings, [key]: value };
}
