/**
 * Which connected Google mailbox would an agent-prepared message come FROM?
 *
 * The browser answers this itself — connection metadata is ordinary user data,
 * so it comes straight from Supabase (root CLAUDE.md: the client never routes a
 * DB read through the Python server). Only safe metadata is read; the refresh
 * token never leaves aidream's vault.
 */

import { listGoogleConnectionInventory } from "@/features/marketing/google/service";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

export interface GmailSendConnection {
  connectionId: string;
  accountEmail: string | null;
  accountName: string | null;
}

export async function resolveGmailSendConnection(
  signal?: AbortSignal,
): Promise<GmailSendConnection | null> {
  const inventory = await listGoogleConnectionInventory(signal);
  const usable = inventory.connections.find(
    (connection) =>
      connection.health === "connected" &&
      connection.scopes.includes(GOOGLE_SCOPE.gmailSend),
  );
  if (!usable) return null;
  return {
    connectionId: usable.id,
    accountEmail: usable.account_email,
    accountName: usable.account_name,
  };
}
