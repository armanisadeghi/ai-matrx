import { readConnectionStatus } from "@/features/connectors/connection-status";
import { apiPost, buildPath } from "@/lib/api/typed-client";
import { createClient } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";
import type {
  StorageAuthorizationStart,
  StorageConnection,
  StorageConnectionRow,
  StorageLifecycleResult,
  StorageOAuthProvider,
} from "@/features/storage-connections/types";

const CONNECTION_SELECT =
  "id, provider, account_email, account_name, scopes, status, last_verified_at, last_error, created_at, metadata";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function storageConnectionFromRow(
  row: StorageConnectionRow,
): StorageConnection {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return {
    id: row.id,
    provider: row.provider as StorageOAuthProvider,
    accountEmail: row.account_email,
    accountName: row.account_name,
    scopes: stringArray(row.scopes),
    status: readConnectionStatus(row.status),
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
    connectedAt: row.created_at,
    requestedScopes: stringArray(metadata.requested_scopes),
    grantedScopes: stringArray(metadata.granted_scopes),
    scopeEvidence:
      typeof metadata.scope_evidence === "string"
        ? metadata.scope_evidence
        : null,
  };
}

/** Read the signed-in person's Box and Dropbox connections directly under RLS. */
export async function listStorageConnections(
  signal?: AbortSignal,
): Promise<StorageConnection[]> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!session?.access_token || !userId) {
    throw new Error("Sign in to load your file connections.");
  }

  const result = await supabase
    .schema("users")
    .from("integration_connections")
    .select(CONNECTION_SELECT)
    .in("provider", ["dropbox", "box"])
    .eq("owner_type", "user")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  if (result.error) {
    throw operationFailed("load your file connections", result.error);
  }
  return (result.data as StorageConnectionRow[]).map(storageConnectionFromRow);
}

export async function startStorageAuthorization(
  provider: StorageOAuthProvider,
): Promise<StorageAuthorizationStart> {
  const { data } = await apiPost(
    buildPath("/storage-oauth/{provider}/authorize", { provider }),
    undefined,
  );
  return {
    authorizationUrl: data.authorization_url,
    provider: data.provider,
    requestedScopes: data.requested_scopes,
  };
}

function lifecycleResult(data: {
  connection_id: string;
  provider: StorageOAuthProvider;
  status: string;
  requested_scopes: string[];
  granted_scopes: string[];
  scope_evidence: string;
  provider_revoked?: boolean | null;
}): StorageLifecycleResult {
  return {
    connectionId: data.connection_id,
    provider: data.provider,
    status: data.status,
    requestedScopes: data.requested_scopes,
    grantedScopes: data.granted_scopes,
    scopeEvidence: data.scope_evidence,
    providerRevoked: data.provider_revoked ?? null,
  };
}

export async function refreshStorageConnection(
  provider: StorageOAuthProvider,
  connectionId: string,
): Promise<StorageLifecycleResult> {
  const { data } = await apiPost(
    buildPath("/storage-oauth/{provider}/refresh", { provider }),
    { connection_id: connectionId },
  );
  return lifecycleResult(data);
}

export async function disconnectStorageConnection(
  provider: StorageOAuthProvider,
  connectionId: string,
): Promise<StorageLifecycleResult> {
  const { data } = await apiPost(
    buildPath("/storage-oauth/{provider}/disconnect", { provider }),
    { connection_id: connectionId },
  );
  return lifecycleResult(data);
}
