const DESKTOP_NATIVE_CAPABILITY = "desktop-native";

type MutableRecord = Record<string, unknown>;

/**
 * Stamp the admin desktop-target preference onto a request body — but ONLY
 * when the body already declares a live `desktop-native` capability.
 *
 * The preference (Settings → Admin Server, `adminPreferences.
 * desktopTargetInstanceId`, persisted local-only) may DIRECT delegation to a
 * specific desktop; it must never DECLARE one. Fabricating the capability
 * here used to override the presence gate in `desktop-native.provider.ts`,
 * so a stale preference silently rode every AI turn: the server stamped
 * `target_instance_id` onto delegated tool calls while the smart-input
 * indicator truthfully showed no desktop bound, and browser-executed tools
 * (war_room_*, ui-first) 404'd their own /tool_results (submission-binding
 * check) and wedged the turn.
 */
export function applyDesktopTargetToRequestBody(
  body: unknown,
  targetInstanceId: string | null | undefined,
): void {
  if (!targetInstanceId || !isRecord(body)) return;

  const existingClient = isRecord(body.client) ? body.client : null;
  const existingState =
    existingClient && isRecord(existingClient.state)
      ? existingClient.state
      : null;
  const existingDesktopState =
    existingState && isRecord(existingState[DESKTOP_NATIVE_CAPABILITY])
      ? existingState[DESKTOP_NATIVE_CAPABILITY]
      : null;

  // No live desktop-native envelope on this request → the presence gate said
  // no desktop is online (or the caller never built a client envelope).
  // Silently skipping is correct: targeting a desktop that isn't declared
  // delegates calls into a void.
  if (!existingClient || !existingState || !existingDesktopState) return;

  body.target_instance_id ??= targetInstanceId;
  existingDesktopState.target_instance_id ??= targetInstanceId;
}

function isRecord(value: unknown): value is MutableRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
