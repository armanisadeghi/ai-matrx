/**
 * usePreferenceValue — Phase 8 compatibility shim.
 *
 * DEPRECATED: prefer `useSetting(path)` from `@/features/settings/hooks/useSetting`.
 *
 * Old signature:
 *   const [value, set] = usePreferenceValue("prompts", "defaultTemperature");
 *
 * Old behaviour: held a local copy of the value and pushed changes to Redux
 * only on unmount. The unified sync engine now persists every mutation as it
 * happens, so that round-trip is no longer needed. This shim maps the legacy
 * call onto `useSetting`, giving callers live-updating state with automatic
 * persistence while still matching the old return shape.
 */
import { useSetting } from "@/features/settings/hooks/useSetting";
import type { UserPreferences } from "@/lib/redux/preferences/userPreferencesSlice";

export function usePreferenceValue<
  T extends keyof UserPreferences,
  K extends keyof UserPreferences[T],
>(
  module: T,
  preference: K,
): [UserPreferences[T][K], (value: UserPreferences[T][K]) => void] {
  const path = `userPreferences.${String(module)}.${String(preference)}`;
  return useSetting<UserPreferences[T][K]>(path);
}
