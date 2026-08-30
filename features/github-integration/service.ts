import { readAllRows } from "@ai-matrx/data/db";
import { isJsonObject } from "@/types/json";
import { createClient } from "@/utils/supabase/client";
import { startOAuthPopup } from "@/utils/oauth-popup";
import type {
  GitHubConnectionInventory,
  GitHubConnectionRow,
  GitHubRepository,
  GitHubResourceRow,
} from "./types";
import { postJson, del as deleteJson } from "@/lib/python-client";

const CONNECTION_SELECT =
  "id, owner_type, owner_user_id, organization_id, provider, provider_subject, account_email, account_name, scopes, status, last_verified_at, last_error, created_at, updated_at, metadata, credential_item_id, vault_secret_key, deleted_at";
const RESOURCE_SELECT =
  "id, connection_id, resource_type, resource_ref, display_name, permission_level, discovered_at, metadata, created_at, updated_at, deleted_at";

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

export async function loadGitHubConnectionInventory(): Promise<GitHubConnectionInventory> {
  const supabase = createClient();
  const connectionResult = await supabase
    .schema("users")
    .from("integration_connections")
    .select(CONNECTION_SELECT)
    .eq("provider", "github")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionResult.error) throw new Error(connectionResult.error.message);

  const connection: GitHubConnectionRow | null = connectionResult.data;
  if (!connection) return { connection: null, repositories: [] };

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
  return {
    connection,
    repositories: resources
      .map(githubRepositoryFromRow)
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

/**
 * Routed through the canonical `lib/python-client.ts` kernel instead of a
 * hand-rolled fetch — this used to build its own Authorization-only headers
 * and never attached X-Organization-Id, even though GitHub connections are
 * organization-scoped (`users.integration_connections.organization_id`).
 * `postJson`/`del` resolve the organization from Redux and are mandatory,
 * fail-closed (aidream commit 8e5ee0b93's AuthMiddleware admission gate).
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
): string {
  const params = new URLSearchParams({
    return_url: returnUrl,
    organization_id: organizationId,
  });
  return `/api/github/oauth/start?${params.toString()}`;
}

/**
 * `organizationId` is mandatory here — GitHub connections are
 * organization-scoped (users.integration_connections.organization_id) and
 * neither this call nor the OAuth round trip it starts can resolve one on
 * its own (a Redux read has to happen at the call site, which has React
 * context this module does not). Callers pass the currently selected
 * organization (`selectOrganizationId`); `start/route.ts` re-validates it
 * fail-closed before ever redirecting to GitHub.
 */
export function startGitHubConnection(
  returnUrl: string,
  organizationId: string,
): Promise<
  | { ok: true; value: "connected" }
  | { ok: false; error: string; cancelled: boolean }
> {
  return startOAuthPopup({
    url: githubConnectUrl(returnUrl, organizationId),
    target: "github_oauth",
    successType: "github_oauth_complete",
    errorType: "github_oauth_error",
    readSuccessValue: () => "connected" as const,
  });
}
