/**
 * conversation-binding-row — THE one derivation of "which box is this
 * conversation bound to?" from a `chat.conversation` row.
 *
 * The binding lives in the row and nowhere else: `sandbox_instance_id` names an
 * orchestrator box, `app_instance_id` names the user's local PC. Those are the
 * two columns aidream's own `resolve_and_arm_run` dispatches on, so whoever
 * bound the conversation — this client, another client, or the server itself
 * (`persist_conversation_binding`) — the answer is the same one column.
 *
 * `metadata.sandbox_override_*` is a DISPLAY MIRROR, never the binding: a bind
 * written by aidream sets the column and no metadata at all. A row that names a
 * box is bound even with an empty mirror; the routing details are re-derived
 * from the box's row at turn time (`resolveSandboxRefDetails`).
 *
 * Three readers share this function so none of them can drift:
 *   1. the SSR seed on `/chat/[conversationId]` (first paint),
 *   2. `loadConversation` (the bundle RPC),
 *   3. `refreshConversationSandboxBinding` (a bind that happened server-side
 *      while this tab was open).
 */

export interface ConversationSandboxBindingRow {
  sandbox_instance_id?: string | null;
  app_instance_id?: string | null;
  metadata?: unknown;
}

export interface ConversationSandboxBinding {
  rowId: string;
  proxyUrl: string;
  tier?: "ec2" | "hosted";
  kind?: "ec2" | "hosted" | "local-pc";
  name?: string;
}

function metaString(
  metadata: unknown,
  key: string,
): string | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : undefined;
}

/**
 * The conversation's binding, or `null` when the row genuinely names no box.
 * Pure; never throws on a partial row (the SSR seed selects three columns, the
 * bundle returns all of them).
 */
export function conversationSandboxBindingFromRow(
  row: ConversationSandboxBindingRow | null | undefined,
): ConversationSandboxBinding | null {
  if (!row) return null;
  const sandboxRowId = row.sandbox_instance_id ?? null;
  const localPcRowId = row.app_instance_id ?? null;
  const rowId = sandboxRowId ?? localPcRowId;
  if (!rowId) return null;

  const tier = metaString(row.metadata, "sandbox_override_tier");
  return {
    rowId,
    proxyUrl: metaString(row.metadata, "sandbox_override_proxy_url") ?? "",
    tier: tier === "ec2" || tier === "hosted" ? tier : undefined,
    kind: localPcRowId && !sandboxRowId ? ("local-pc" as const) : undefined,
    name: metaString(row.metadata, "sandbox_override_name"),
  };
}
