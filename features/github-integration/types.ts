import type { Tables } from "@/types/database.types";

type IntegrationConnectionRow = Tables<
  { schema: "users" },
  "integration_connections"
>;

export type GitHubConnectionRow = Pick<
  IntegrationConnectionRow,
  | "id"
  | "owner_type"
  | "owner_user_id"
  | "organization_id"
  | "provider"
  | "provider_subject"
  | "account_email"
  | "account_name"
  | "scopes"
  | "status"
  | "last_verified_at"
  | "last_error"
  | "created_at"
  | "updated_at"
  | "metadata"
  | "deleted_at"
>;

export type GitHubResourceRow = Tables<
  { schema: "users" },
  "integration_connection_resources"
>;

export interface GitHubRepository {
  id: string;
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  permissionLevel: string | null;
}

export interface GitHubConnectionInventory {
  connection: GitHubConnectionRow | null;
  repositories: GitHubRepository[];
  /** The connected GitHub identity, parsed out of connection metadata. */
  account: GitHubAccount | null;
  /** Every account AI Matrx is installed on. Empty means no repository access. */
  installations: GitHubInstallation[];
  /** What the last sync counted, which can differ from `repositories.length`. */
  syncedRepositoryCount: number;
  lastSyncedAt: string | null;
}

/**
 * One AI Matrx Admin GitHub App installation, as GitHub reports it.
 *
 * An installation — not the connection — is what actually grants repository
 * access. A user connects once, but each account (their own user account, and
 * every organization they add) is a SEPARATE installation. This is exactly why
 * `AI-Matrix-Engine`'s repositories 403 on clone while `armanisadeghi`'s work:
 * one installation exists, not two. The card must therefore show installations
 * as rows, never collapse them into a single "connected" word.
 */
export interface GitHubInstallation {
  id: number | null;
  accountLogin: string;
  accountType: string | null;
  accountAvatarUrl: string | null;
  /** GitHub's own words: "all" or "selected". */
  repositorySelection: "all" | "selected" | null;
  repositoryCount: number;
  /** That installation's settings page on GitHub. */
  htmlUrl: string | null;
}

export interface GitHubAccount {
  login: string;
  avatarUrl: string | null;
  htmlUrl: string | null;
}
