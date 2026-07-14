const DESKTOP_NATIVE_CAPABILITY = "desktop-native";

type MutableRecord = Record<string, unknown>;

export function applyDesktopTargetToRequestBody(
  body: unknown,
  targetInstanceId: string | null | undefined,
): void {
  if (!targetInstanceId || !isRecord(body)) return;

  body.target_instance_id ??= targetInstanceId;

  const existingClient = isRecord(body.client) ? body.client : {};
  const existingState = isRecord(existingClient.state)
    ? existingClient.state
    : {};
  const existingDesktopState = isRecord(
    existingState[DESKTOP_NATIVE_CAPABILITY],
  )
    ? existingState[DESKTOP_NATIVE_CAPABILITY]
    : {};
  const capabilities = Array.isArray(existingClient.capabilities)
    ? existingClient.capabilities.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  body.client = {
    ...existingClient,
    capabilities: capabilities.includes(DESKTOP_NATIVE_CAPABILITY)
      ? capabilities
      : [...capabilities, DESKTOP_NATIVE_CAPABILITY],
    state: {
      ...existingState,
      [DESKTOP_NATIVE_CAPABILITY]: {
        platform: "",
        engine_version: "",
        instance_id: "",
        tunnel_state: "none",
        ...existingDesktopState,
        target_instance_id: targetInstanceId,
      },
    },
  };
}

function isRecord(value: unknown): value is MutableRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
