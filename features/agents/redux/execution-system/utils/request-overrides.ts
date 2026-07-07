/**
 * Manual request-override escape hatch — "add anything I want to the request
 * for testing." Reads the raw JSON text a user typed in "Chat Options →
 * Settings" (`builderAdvancedSettings.requestOverrides`), parses it, and hands
 * back a plain object to shallow-merge onto the outbound request body just
 * before POST. Top-level keys override the assembled payload.
 *
 * Loud on failure (per the recovery-layer rule): invalid JSON or a non-object
 * returns an `error` string the caller surfaces via toast, and the request is
 * sent WITHOUT the override rather than with garbage.
 */

import type { RootState } from "@/lib/redux/store";
import { selectBuilderAdvancedSettings } from "../instance-ui-state/instance-ui-state.selectors";

export interface RequestOverridesResult {
  /** Parsed override object to merge, or null when none / invalid. */
  overrides: Record<string, unknown> | null;
  /** Human-readable reason the override was skipped, or null on success. */
  error: string | null;
}

/**
 * Parse the raw override text into a merge-able object. Exported for the UI
 * editor so it can show inline validation with the same rules the thunk uses.
 */
export function parseRequestOverrides(
  raw: string | null | undefined,
): RequestOverridesResult {
  if (!raw || !raw.trim()) return { overrides: null, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      overrides: null,
      error: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      overrides: null,
      error: "Request overrides must be a JSON object (e.g. {\"debug\": true}).",
    };
  }
  return { overrides: parsed as Record<string, unknown>, error: null };
}

/** Resolve the override object for a conversation from Redux state. */
export function resolveRequestOverrides(
  state: RootState,
  conversationId: string,
): RequestOverridesResult {
  return parseRequestOverrides(
    selectBuilderAdvancedSettings(conversationId)(state)?.requestOverrides,
  );
}
