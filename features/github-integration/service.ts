import { readAllRows } from "@ai-matrx/data/db";
import { isJsonObject } from "@/types/json";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { startOAuthPopup } from "@/utils/oauth-popup";
import type {
  GitHubAccount,
  GitHubConnectionInventory,
  GitHubConnectionRow,
  GitHubInstallation,
  GitHubRepository,
  GitHubResourceRow,
} from "./types";
import { postJson, del as deleteJson } from "@/lib/python-client";
import { operationFailed } from "@/utils/errors";

/**
 * Where a user adds AI Matrx to another account. GitHub's installation flow is
 * the ONLY place repository access can be widened — AI Matrx never invents a
 * second access list (common-docs/systems/integrations/github/FEATURE.md).
 * Every visit carries an opaque, user-bound state minted by aidream. A bare
 * GitHub installation URL is never safe enough to link an account.
 */
const CONNECTION_SELECT =
  "id, owner_type, owner_user_id, organization_id, provider, provider_subject, account_email, account_name, scopes, status, last_verified_at, last_error, created_at, updated_at, metadata, deleted_at";
const RESOURCE_SELECT =
  "id, connection_id, resource_type, resource_ref, display_name, permission_level, discovered_at, metadata, custom_fields, created_at, updated_at, deleted_at";

function requiredMetadataString(
  metadata: GitHubResourceRow["metadata"],
  key: string,
  repository: string,
): string {
  if (!isJsonObject(metadata) || typeof metadata[key] !== "string") {
    throw new Error(
      `GitHub repository ${repository} is missing required ${key} metadata. Refresh the connection.`,
    );
  }
  return metadata[key];
}

function optionalMetadataBoolean(
  metadata: GitHubResourceRow["metadata"],
  key: string,
): boolean {
  return isJsonObject(metadata) && typeof metadata[key] === "boolean"
    ? metadata[key]
    : false;
}

export const EMPTY_INVENTORY: GitHubConnectionInventory = {
  connection: null,
  repositories: [],
  account: null,
  installations: [],
  syncedRepositoryCount: 0,
  lastSyncedAt: null,
};

export function githubRepositoryFromRow(
  row: GitHubResourceRow,
): GitHubRepository {
  if (row.resource_type !== "github_repository") {
    throw new Error(`Unknown GitHub resource type: ${row.resource_type}`);
  }
  return {
    id: row.resource_ref,
    fullName: row.display_name,
    htmlUrl: requiredMetadataString(row.metadata, "html_url", row.display_name),
    cloneUrl: requiredMetadataString(
      row.metadata,
      "clone_url",
      row.display_name,
    ),
    defaultBranch: requiredMetadataString(
      row.metadata,
      "default_branch",
      row.display_name,
    ),
    private: optionalMetadataBoolean(row.metadata, "private"),
    archived: optionalMetadataBoolean(row.metadata, "archived"),
    permissionLevel: row.permission_level,
  };
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataNumber(
  metadata: Record<string, unknown>,
  key: string,
): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * aidream writes these rows in `_installation_metadata` and they are the only
 * record of WHICH accounts are covered. Parsed defensively: a connection saved
 * by an older backend simply yields fewer rows, which the card renders as
 * "no installations" with the fix attached — never as a crash or a silent
 * "connected".
 */
export function githubInstallationsFromConnection(
  connection: GitHubConnectionRow | null,
): GitHubInstallation[] {
  if (!connection || !isJsonObject(connection.metadata)) return [];
  const raw = connection.metadata.installations;
  if (!Array.isArray(raw)) return [];
  const installations: GitHubInstallation[] = [];
  for (const entry of raw) {
    if (!isJsonObject(entry)) continue;
    const accountLogin = metadataString(entry, "account_login");
    if (!accountLogin) continue;
    const selection = metadataString(entry, "repository_selection");
    installations.push({
      id: metadataNumber(entry, "id"),
      accountLogin,
      accountType: metadataString(entry, "account_type"),
      accountAvatarUrl: metadataString(entry, "account_avatar_url"),
      repositorySelection:
        selection === "all" || selection === "selected" ? selection : null,
      repositoryCount: metadataNumber(entry, "repository_count") ?? 0,
      suspended: entry.suspended === true,
      htmlUrl:
        metadataString(entry, "html_url") ??
        (metadataNumber(entry, "id") === null
          ? null
          : `https://github.com/settings/installations/${metadataNumber(entry, "id")}`),
    });
  }
  return installations.sort((a, b) =>
    a.accountLogin.localeCompare(b.accountLogin),
  );
}

export function githubAccountFromConnection(
  connection: GitHubConnectionRow | null,
): GitHubAccount | null {
  if (!connection) return null;
  const metadata = isJsonObject(connection.metadata) ? connection.metadata : {};
  const login =
    metadataString(metadata, "account_login") ?? connection.account_name;
  if (!login) return null;
  return {
    login,
    avatarUrl: metadataString(metadata, "account_avatar_url"),
    htmlUrl:
      metadataString(metadata, "account_html_url") ??
      `https://github.com/${encodeURIComponent(login)}`,
  };
}

export async function loadGitHubConnectionInventory(): Promise<GitHubConnectionInventory> {
  const supabase = createClient();
  // `users.integration_connections` grants no access to `anon`. This direct
  // service can also be called outside its hook, so make the last auth check
  // immediately before constructing the PostgREST query.
  //
  // Identity comes from the access token's LOCALLY VERIFIED claims, never from
  // `getSession().user` (which believes whatever the cookie says) and never
  // from `auth.getUser()` (an auth-server round trip per call).
  const {
    data: { user },
    error: authError,
  } = await getClaimsUser(supabase);
  if (authError) {
    throw operationFailed("load your GitHub connection", authError);
  }
  const userId = user?.id;
  if (!userId) return EMPTY_INVENTORY;

  const connectionResult = await supabase
    .schema("users")
    .from("integration_connections")
    .select(CONNECTION_SELECT)
    .eq("provider", "github")
    .eq("owner_type", "user")
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionResult.error) {
    throw operationFailed(
      "load your GitHub connection",
      connectionResult.error,
    );
  }

  const connection: GitHubConnectionRow | null = connectionResult.data;
  if (!connection) return EMPTY_INVENTORY;
  if (connection.owner_type !== "user" || connection.owner_user_id !== userId) {
    return EMPTY_INVENTORY;
  }

  const resources = await readAllRows<GitHubResourceRow>(
    ({ from, to }) =>
      supabase
        .schema("users")
        .from("integration_connection_resources")
        .select(RESOURCE_SELECT, { count: "exact" })
        .eq("connection_id", connection.id)
        .eq("resource_type", "github_repository")
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "users.integration_connection_resources (GitHub repositories)" },
  );
  const metadata = isJsonObject(connection.metadata) ? connection.metadata : {};
  return {
    connection,
    repositories: resources
      .map(githubRepositoryFromRow)
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    account: githubAccountFromConnection(connection),
    installations: githubInstallationsFromConnection(connection),
    syncedRepositoryCount:
      metadataNumber(metadata, "repository_count") ?? resources.length,
    lastSyncedAt: metadataString(metadata, "last_repository_sync_at"),
  };
}

/**
 * Routed through the canonical `lib/python-client.ts` kernel instead of a
 * hand-rolled fetch. GitHub accounts are per-Matrx-user; the organization
 * header only admits the action in the current workspace and is never stored
 * as ownership on `users.integration_connections`.
 */
async function githubBackend(
  path: string,
  method: "POST" | "DELETE" = "POST",
): Promise<void> {
  try {
    if (method === "DELETE") {
      await deleteJson(path);
    } else {
      await postJson(path, {});
    }
  } catch (err) {
    const detail =
      err instanceof Error && err.message
        ? err.message
        : "GitHub connection request failed.";
    throw new Error(detail);
  }
}

export function syncGitHubConnection(): Promise<void> {
  return githubBackend("/api/github-integrations/sync");
}

export function disconnectGitHubConnection(): Promise<void> {
  return githubBackend("/api/github-integrations/connection", "DELETE");
}

export function githubConnectUrl(
  returnUrl: string,
  organizationId: string,
  flow: "authorize" | "install" = "authorize",
): string {
  const params = new URLSearchParams({
    return_url: returnUrl,
    organization_id: organizationId,
    flow,
  });
  return `/api/github/oauth/start?${params.toString()}`;
}

/**
 * `organizationId` is required for request admission. The GitHub account
 * connection itself stays owned by the authenticated Matrx user; individual
 * GitHub App installations are discovered separately.
 */
export function startGitHubConnection(
  returnUrl: string,
  organizationId: string,
  flow: "authorize" | "install" = "authorize",
): Promise<
  | { ok: true; value: "connected" }
  | { ok: false; error: string; cancelled: boolean }
> {
  return startOAuthPopup({
    url: githubConnectUrl(returnUrl, organizationId, flow),
    target: "github_oauth",
    successType: "github_oauth_complete",
    errorType: "github_oauth_error",
    readSuccessValue: () => "connected" as const,
  });
}
