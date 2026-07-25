import { createClient } from "@/utils/supabase/client";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
  GoogleConnectionInventory,
  GoogleConnectionOwner,
  GoogleConnectionResult,
} from "@/features/marketing/google/types";

// `credential_item_id` / `vault_secret_key` are REFERENCES, never secrets (a
// vault item id and a key name). Reading them is what lets the UI tell the
// truth about a connection's health without a server round-trip.
const CONNECTION_SELECT =
  "id, owner_type, owner_user_id, organization_id, provider, provider_subject, account_email, account_name, scopes, status, last_verified_at, last_error, created_at, updated_at, metadata, credential_item_id, vault_secret_key";
const RESOURCE_SELECT =
  "id, connection_id, resource_type, resource_ref, display_name, permission_level, discovered_at, metadata";

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

type ConnectionRow = {
  id: string;
  owner_type: string;
  owner_user_id: string | null;
  organization_id: string | null;
  provider: string;
  provider_subject: string;
  account_email: string | null;
  account_name: string | null;
  scopes: string[];
  status: string;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  metadata: unknown;
  credential_item_id: string | null;
  vault_secret_key: string | null;
};

export type GoogleConnectionResourceRow = {
  id: string;
  connection_id: string;
  resource_type: string;
  resource_ref: string;
  display_name: string;
  permission_level: string | null;
  discovered_at: string;
  metadata: unknown;
};

function connectionSummary(row: ConnectionRow): GoogleConnectionSummary {
  const status =
    row.status === "needs_attention" || row.status === "revoked"
      ? row.status
      : "connected";
  const credentialPresent = Boolean(row.credential_item_id || row.vault_secret_key);
  return {
    ...row,
    owner_type: row.owner_type === "organization" ? "organization" : "user",
    provider: "google",
    status,
    metadata: recordValue(row.metadata),
    credential_present: credentialPresent,
    credential_stable: Boolean(row.credential_item_id),
    // A row whose credential reference is gone CANNOT authorize anything, no
    // matter what `status` claims — parity with aidream's precondition.
    health:
      status === "revoked"
        ? "revoked"
        : credentialPresent && status === "connected"
          ? "connected"
          : "needs_reauth",
  };
}

export function connectionResource(
  row: GoogleConnectionResourceRow,
): GoogleConnectionResource {
  if (
    row.resource_type !== "search_console_property" &&
    row.resource_type !== "analytics_property" &&
    row.resource_type !== "youtube_channel"
  ) {
    throw new Error(
      `Unknown Google connection resource type: ${row.resource_type}`,
    );
  }
  return {
    ...row,
    resource_type: row.resource_type,
    metadata: recordValue(row.metadata),
  };
}

export async function listGoogleConnectionInventory(
  signal?: AbortSignal,
): Promise<GoogleConnectionInventory> {
  const supabase = createClient();
  const connections = await supabase
    .schema("users")
    .from("integration_connections")
    .select(CONNECTION_SELECT)
    .eq("provider", "google")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  if (connections.error) throw new Error(connections.error.message);

  const ids = connections.data.map((connection) => connection.id);
  if (!ids.length) return { connections: [], resources: [] };
  const resources = await supabase
    .schema("users")
    .from("integration_connection_resources")
    .select(RESOURCE_SELECT)
    .in("connection_id", ids)
    .is("deleted_at", null)
    .order("resource_type", { ascending: true })
    .order("display_name", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  if (resources.error) throw new Error(resources.error.message);

  return {
    connections: connections.data.map(connectionSummary),
    resources: resources.data.map(connectionResource),
  };
}

// The Google credential control plane lives on aidream ("the brain"): it
// exchanges the one-time code, stores the refresh token in the CANONICAL
// secrets vault (user vault / organization vault), and keeps only safe
// metadata + a vault reference in users.integration_connections. The browser
// calls aidream directly with the caller's Supabase JWT — no Next.js hop and
// no client-side secret handling.

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function aidreamPost(
  path: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to manage Google.");
  const response = await fetch(`${backendBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: unknown;
    };
    throw new Error(
      typeof payload.detail === "string" ? payload.detail : fallback,
    );
  }
  return response;
}

export async function connectGoogle(
  code: string,
  owner: GoogleConnectionOwner,
): Promise<GoogleConnectionResult> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Google OAuth is not configured on this deployment.");
  }
  const response = await aidreamPost(
    "/api/google-integrations/exchange",
    {
      code,
      client_id: clientId,
      owner_type: owner.type,
      organization_id:
        owner.type === "organization" ? owner.organizationId : null,
      redirect_uri: window.location.origin,
    },
    "Unable to connect Google.",
  );
  const body = (await response.json()) as { connection_id?: unknown };
  if (typeof body.connection_id !== "string") {
    throw new Error("Google connected without returning a connection ID.");
  }
  return { connectionId: body.connection_id };
}

export async function disconnectGoogle(connectionId: string): Promise<void> {
  await aidreamPost(
    "/api/google-integrations/disconnect",
    { connection_id: connectionId },
    "Unable to disconnect Google.",
  );
}
