/**
 * The Microsoft connection door — the screen side of a server flow that has
 * existed, complete and unreachable, since 2026-08-28.
 *
 * `aidream` has issued PKCE state, exchanged codes, stored audience-bound Graph
 * tokens in the Vault, refreshed them and disconnected them for weeks; its
 * callback even redirects a person back to
 * `/user-settings/integrations?provider=microsoft`. Nothing in this app ever
 * called it, so the platform holds ZERO Microsoft connections and every bulk
 * reader built on Graph is unreachable. This module is the missing half.
 *
 * Reads go direct to Supabase under RLS (clients never proxy DB reads through
 * the server); the authorization lifecycle goes to aidream through the
 * sanctioned contract-bound client, so a server rename lights this file up red.
 */

import { apiPost } from "@/lib/api/typed-client";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { operationFailed } from "@/utils/errors";
import type { MicrosoftCampaign } from "@/features/microsoft-integration/campaigns";
import type {
  MicrosoftConnection,
  MicrosoftConnectionRow,
} from "@/features/microsoft-integration/types";

const CONNECTION_SELECT =
  "id, owner_type, owner_user_id, provider, account_email, account_name, scopes, status, last_verified_at, last_error, created_at, updated_at, metadata, deleted_at";

/** Graph returns scopes URL-prefixed; a person should read the short name. */
function shortScope(scope: string): string {
  return scope.replace(/^https:\/\/graph\.microsoft\.com\//i, "");
}

function connectionFromRow(row: MicrosoftConnectionRow): MicrosoftConnection {
  return {
    id: row.id,
    accountEmail: row.account_email,
    accountName: row.account_name,
    scopes: (row.scopes ?? []).map(shortScope),
    status: row.status,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
    connectedAt: row.created_at,
  };
}

/** Every Microsoft account this signed-in person has connected. */
export async function listMicrosoftConnections(
  signal?: AbortSignal,
): Promise<MicrosoftConnection[]> {
  const supabase = createClient();
  // Identity from the access token's locally verified claims — `getSession()`
  // believes the cookie and `getUser()` costs an auth-server round trip.
  const {
    data: { user },
    error: authError,
  } = await getClaimsUser(supabase);
  if (authError) {
    throw operationFailed("load your Microsoft connections", authError);
  }
  const userId = user?.id;
  if (!userId) return [];

  const result = await supabase
    .schema("users")
    .from("integration_connections")
    .select(CONNECTION_SELECT)
    .eq("provider", "microsoft")
    .eq("owner_type", "user")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  if (result.error) {
    throw operationFailed("load your Microsoft connections", result.error);
  }
  return (result.data as MicrosoftConnectionRow[]).map(connectionFromRow);
}

export interface MicrosoftAuthorizationStart {
  readonly authorizationUrl: string;
  readonly campaigns: readonly string[];
  readonly requestedScopes: readonly string[];
}

/**
 * Ask aidream for the one-time Microsoft authorization URL.
 *
 * The URL is minted server-side with PKCE and a user-bound, 10-minute state —
 * a hand-built Microsoft URL would have neither, so this is the only lawful way
 * to start the flow.
 */
export async function startMicrosoftAuthorization(
  campaigns: readonly MicrosoftCampaign[],
): Promise<MicrosoftAuthorizationStart> {
  const { data } = await apiPost("/microsoft-integrations/authorize", {
    campaigns: [...campaigns],
  });
  return {
    authorizationUrl: data.authorization_url,
    campaigns: data.campaigns,
    requestedScopes: data.requested_scopes.map(shortScope),
  };
}

/** Re-check a connection against Microsoft without reading any content. */
export async function preflightMicrosoftConnection(
  connectionId: string,
): Promise<{ status: string; scopes: readonly string[] }> {
  const { data } = await apiPost("/microsoft-integrations/preflight", {
    connection_id: connectionId,
  });
  return { status: data.status, scopes: (data.scopes ?? []).map(shortScope) };
}

/** Drop the connection and its Vault credential. Microsoft keeps its own record. */
export async function disconnectMicrosoftConnection(
  connectionId: string,
): Promise<void> {
  await apiPost("/microsoft-integrations/disconnect", {
    connection_id: connectionId,
  });
}
