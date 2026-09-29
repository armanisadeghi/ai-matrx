/**
 * The human name a tool card shows, when the server sends one.
 *
 * A projected agent tool (an Orchestra member, an agent-as-tool) is called by an OPAQUE name
 * (`custom_tool_N`) so the model never sees an agent UUID. The server stamps the real name on the
 * `tool_started` event's `data.display_name` (an Orchestra member reads "<role title> · <agent name>",
 * e.g. "Tough editor · The Tough Editor"). Live 2026-09-28 the PR Director's specialists showed as
 * "Custom Tool 5" because nothing read it. Streamed entries and reloaded calls (their persisted events)
 * both read it here, so the two paths can never disagree.
 */
export function displayNameFromToolData(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>).display_name;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The first `display_name` any of a call's persisted events carries (the `tool_started` event's). */
export function displayNameFromToolEvents(events: readonly unknown[]): string | null {
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const name = displayNameFromToolData((event as Record<string, unknown>).data);
    if (name) return name;
  }
  return null;
}
