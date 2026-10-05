/**
 * The organization an AI app's AI Matrx connection files its work in — chosen on the sign-in
 * (consent) screen, written to the ONE store the server reads for it:
 * `users.user_preferences.preferences.connections.mcp.organizationId`
 * (aidream `services/organizations/connection_org.py`, verified for membership on every call).
 *
 * Arman, 2026-10-04: a person who already picked their organization at the top of the app must
 * never be asked again by her AI. The consent screen shows that organization (changeable), and
 * approving sets it on the connection — a setting on the connection, chosen on purpose, never a
 * user-level default.
 */

import { mergeJsonColumn, asJsonObject } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";

export async function setMcpConnectionOrganization(userId: string, organizationId: string): Promise<void> {
  const supabase = createClient();
  const table = () => supabase.schema("users").from("user_preferences");
  const outcome = await mergeJsonColumn<{ id: string; version: number; preferences: unknown }>({
    fetchCurrent: () => table().select("id, version, preferences").eq("user_id", userId).maybeSingle(),
    readColumn: (row) => row.preferences,
    merge: (current) => {
      const connections = asJsonObject(current.connections);
      const mcp = asJsonObject(connections.mcp);
      return {
        ...current,
        connections: { ...connections, mcp: { ...mcp, organizationId, setAt: new Date().toISOString() } },
      };
    },
    applyUpdate: ({ value, expectedVersion, nextVersion }) =>
      table()
        .update({ preferences: value, version: nextVersion })
        .eq("user_id", userId)
        .eq("version", expectedVersion)
        .select("id, version, preferences")
        .maybeSingle(),
  });
  if (outcome.status !== "saved") {
    throw new Error("Your AI could not be set to that organization. Try again.");
  }
}
