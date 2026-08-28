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
import { dedupeGoogleConnectionsForPicker } from "@/features/marketing/google/health";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

export interface GoogleConnectionRef {
  connectionId: string;
  accountEmail: string | null;
  accountName: string | null;
}

export type GoogleConnectionCapability = "workspace" | "gmail-send";

const GOOGLE_CONNECTION_PREFERENCE_KEYS: Record<
  GoogleConnectionCapability,
  string
> = {
  workspace: "google:preferred-connection:workspace",
  "gmail-send": "google:preferred-connection:gmail-send",
};

const GOOGLE_CONNECTION_CAPABILITY_SCOPES: Record<
  GoogleConnectionCapability,
  string
> = {
  workspace: GOOGLE_SCOPE.driveFile,
  "gmail-send": GOOGLE_SCOPE.gmailSend,
};

/** Where AI Matrx connects to Google. Every refusal points here. */
export const GOOGLE_WORKSPACE_SETTINGS_HREF =
  "/user-settings/integrations/google-workspace";

/**
 * Return one healthy choice per distinct Google identity for a capability.
 * Personal and organization connections to the same Google subject remain one
 * choice; genuinely different Google accounts always remain separate.
 */
export function eligibleGoogleConnections(
  connections: GoogleConnectionSummary[],
  capability: GoogleConnectionCapability,
  selectedConnectionId?: string | null,
): GoogleConnectionSummary[] {
  const scope = GOOGLE_CONNECTION_CAPABILITY_SCOPES[capability];
  return dedupeGoogleConnectionsForPicker(
    connections.filter(
      (connection) =>
        connection.health === "connected" && connection.scopes.includes(scope),
    ),
    selectedConnectionId,
  );
}

/** Read the browser-local preference without making it credential state. */
export function preferredGoogleConnectionId(
  capability: GoogleConnectionCapability,
): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(
    GOOGLE_CONNECTION_PREFERENCE_KEYS[capability],
  );
}

/**
 * Remember only a safe connection UUID. Tokens and provider data never enter
 * browser storage; the canonical credential remains in aidream's vault.
 */
export function rememberGoogleConnection(
  capability: GoogleConnectionCapability,
  connectionId: string,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    GOOGLE_CONNECTION_PREFERENCE_KEYS[capability],
    connectionId,
  );
}

/** Resolve an explicit/preferred choice, falling back only when it is invalid. */
export function selectGoogleConnection(
  connections: GoogleConnectionSummary[],
  capability: GoogleConnectionCapability,
  selectedConnectionId?: string | null,
): GoogleConnectionSummary | null {
  const eligible = eligibleGoogleConnections(
    connections,
    capability,
    selectedConnectionId,
  );
  return (
    eligible.find((connection) => connection.id === selectedConnectionId) ??
    eligible[0] ??
    null
  );
}

async function resolveByScope(
  capability: GoogleConnectionCapability,
  signal?: AbortSignal,
): Promise<GoogleConnectionRef | null> {
  const inventory = await listGoogleConnectionInventory(signal);
  const usable = selectGoogleConnection(
    inventory.connections,
    capability,
    preferredGoogleConnectionId(capability),
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
  return resolveByScope("workspace", signal);
}

/** The mailbox a reviewed message would be sent from. */
export function resolveGmailSendConnection(
  signal?: AbortSignal,
): Promise<GoogleConnectionRef | null> {
  return resolveByScope("gmail-send", signal);
}
