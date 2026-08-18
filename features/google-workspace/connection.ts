/**
 * Which connected Google account is a given operation going to use?
 *
 * The browser answers this itself — connection metadata is ordinary user data,
 * so it comes straight from Supabase (root CLAUDE.md: the client never routes a
 * DB read through the Python server). Only safe metadata is read; the refresh
 * token never leaves aidream's vault.
 *
 * Both resolvers return `null` rather than throwing, because "no Google account
 * connected" is a normal state with a one-click fix, not an error — every caller
 * turns it into an offer to connect.
 */

import { listGoogleConnectionInventory } from "@/features/marketing/google/service";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

export interface GoogleConnectionRef {
  connectionId: string;
  accountEmail: string | null;
  accountName: string | null;
}

/** Where AI Matrx connects to Google. Every refusal points here. */
export const GOOGLE_WORKSPACE_SETTINGS_HREF =
  "/user-settings/integrations/google-workspace";

async function resolveByScope(
  scope: string,
  signal?: AbortSignal,
): Promise<GoogleConnectionRef | null> {
  const inventory = await listGoogleConnectionInventory(signal);
  const usable = inventory.connections.find(
    (connection) =>
      connection.health === "connected" && connection.scopes.includes(scope),
  );
  if (!usable) return null;
  return {
    connectionId: usable.id,
    accountEmail: usable.account_email,
    accountName: usable.account_name,
  };
}

/** The account a Doc or Sheet is read from, written to, or created in. */
export function resolveGoogleWorkspaceConnection(
  signal?: AbortSignal,
): Promise<GoogleConnectionRef | null> {
  return resolveByScope(GOOGLE_SCOPE.driveFile, signal);
}

/** The mailbox a reviewed message would be sent from. */
export function resolveGmailSendConnection(
  signal?: AbortSignal,
): Promise<GoogleConnectionRef | null> {
  return resolveByScope(GOOGLE_SCOPE.gmailSend, signal);
}
