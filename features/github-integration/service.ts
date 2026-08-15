import { readAllRows } from "@/lib/supabase/readAllRows";
import { isJsonObject } from "@/types/json";
import { createClient } from "@/utils/supabase/client";
import type {
  GitHubConnectionInventory,
  GitHubConnectionRow,
  GitHubRepository,
  GitHubResourceRow,
} from "./types";

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
    cloneUrl: requiredMetadataString(row.metadata, "clone_url", row.display_name),
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

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function githubBackend(path: string, method: "POST" | "DELETE" = "POST"): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to manage GitHub.");
  const response = await fetch(`${backendBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const detail =
      isJsonObject(payload) && typeof payload.detail === "string"
        ? payload.detail
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

export function githubConnectUrl(returnUrl: string): string {
  return `/api/github/oauth/start?return_url=${encodeURIComponent(returnUrl)}`;
}
