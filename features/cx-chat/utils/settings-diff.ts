// app/(dev)/demos/chat/_lib/settings-diff.ts
//
// Settings override diffing — computes the minimal set of overrides
// to send to the API. Only settings that differ from the agent's
// defaults are included. Sending unchanged settings causes the server
// to reject the request.

import type { LLMParams } from "@/lib/api/types";
/**
 * Compare user settings against agent defaults and return ONLY the overrides.
 *
 * Rules:
 * - If a key exists in userSettings with a different value → include as override
 * - If a key exists in userSettings but not in defaults → include (new key added)
 * - If a key was removed from defaults by the user → include as explicit null
 * - If a key has the same value in both → exclude (not an override)
 *
 * @returns An object containing only the changed/added settings, or null if no overrides.
 */
export function computeSettingsOverrides(
  agentDefaults: LLMParams | undefined,
  userSettings: LLMParams,
): LLMParams | null {
  const defaults = (agentDefaults ?? {}) as Record<string, unknown>;
  const user = userSettings as Record<string, unknown>;
  const overrides: Record<string, unknown> = {};
  let hasOverrides = false;

  // Check for changed or added keys
  for (const key of Object.keys(user)) {
    const userVal = user[key];
    const defaultVal = defaults[key];

    // Deep equality check for objects/arrays
    if (!deepEqual(userVal, defaultVal)) {
      overrides[key] = userVal;
      hasOverrides = true;
    }
  }

  // Check for removed keys (present in defaults but not in user settings)
  // Only flag as removed if the user explicitly cleared it
  for (const key of Object.keys(defaults)) {
    if (
      !(key in user) &&
      defaults[key] !== undefined &&
      defaults[key] !== null
    ) {
      // Key was in defaults but user removed it — send null to clear
      overrides[key] = null;
      hasOverrides = true;
    }
  }

  return hasOverrides ? (overrides as LLMParams) : null;
}

/**
 * Simple deep equality check for JSON-serializable values.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  return false;
}
