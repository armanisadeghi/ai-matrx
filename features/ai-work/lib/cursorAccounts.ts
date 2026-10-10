/**
 * cursorAccounts — the person's connected Cursor API keys and their Cursor
 * cloud agents (agent mail, Phase 5; aidream `agent_messaging/cursor_cloud.py`).
 *
 * Connect sends the pasted key once to the server, which checks it with
 * Cursor and keeps it only in the Vault. THE KEY IS NEVER KEPT HERE: callers
 * hold it in component state only, clear it on submit, and never log it.
 * The list itself is read straight from `users.integration_connections`
 * (provider `cursor`), like every other connection.
 */

import { postJson, getJson } from "@/lib/python-client";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { operationFailed } from "@/utils/errors";

export const CURSOR_DASHBOARD_URL = "https://cursor.com/dashboard?tab=integrations";

export interface CursorAccountRow {
  id: string;
  label: string;
  status: string;
}

export async function readCursorAccounts(): Promise<CursorAccountRow[]> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await getClaimsUser(supabase);
  if (authError) throw operationFailed("load your Cursor accounts", authError);
  if (!user?.id) return [];
  const { data, error } = await supabase
    .schema("users")
    .from("integration_connections")
    .select("id, account_name, account_email, status")
    .eq("provider", "cursor")
    .eq("owner_type", "user")
    .eq("owner_user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw operationFailed("load your Cursor accounts", error);
  return data.map((row) => ({
    id: row.id,
    label: row.account_name ?? row.account_email ?? "Cursor key",
    status: row.status,
  }));
}

/** The server's refusal sentence (BackendApiError `details.message`), else the error's own message. */
export function cursorErrorMessage(cause: unknown, fallback: string): string {
  if (cause && typeof cause === "object") {
    const c = cause as { details?: unknown; detail?: unknown; data?: unknown; body?: unknown; message?: unknown };
    for (const holder of [c.details, c.detail, c.data, c.body]) {
      if (holder && typeof holder === "object") {
        const inner = (holder as { detail?: unknown; message?: unknown }).detail ?? holder;
        const msg = (inner as { message?: unknown }).message;
        if (typeof msg === "string" && msg) return msg;
      }
    }
    if (typeof c.message === "string" && c.message) return c.message;
  }
  return fallback;
}

export async function connectCursorKey(apiKey: string, label?: string): Promise<{ label: string }> {
  const { data } = await postJson<{ ok: boolean; label?: string }, { api_key: string; label?: string }>(
    "/agent-messages/cursor/connect",
    { api_key: apiKey, ...(label?.trim() ? { label: label.trim() } : {}) },
  );
  return { label: data.label ?? "Cursor key" };
}

export async function disconnectCursorKey(connectionId: string): Promise<void> {
  await postJson<{ ok: boolean }, { connection_id: string }>("/agent-messages/cursor/disconnect", {
    connection_id: connectionId,
  });
}

export interface CursorAgentChoice {
  agentId: string;
  name: string;
  status: string;
  connectionId: string;
  account: string;
}

export async function listCursorAgents(): Promise<{
  agents: CursorAgentChoice[];
  problems: { account: string; detail: string }[];
}> {
  const { data } = await getJson<{
    agents?: Array<{ agent_id: string; name: string; status: string; connection_id: string; account: string }>;
    problems?: Array<{ account: string; detail: string }>;
  }>("/agent-messages/cursor/agents");
  return {
    agents: (data.agents ?? []).map((a) => ({
      agentId: a.agent_id,
      name: a.name,
      status: a.status,
      connectionId: a.connection_id,
      account: a.account,
    })),
    problems: data.problems ?? [],
  };
}

export async function addCursorAgentToRoom(roomId: string, agent: CursorAgentChoice): Promise<void> {
  await postJson<{ ok: boolean }, { agent_id: string; connection_id: string; room: string; name: string }>(
    "/agent-messages/cursor/add",
    { agent_id: agent.agentId, connection_id: agent.connectionId, room: roomId, name: agent.name },
  );
}
