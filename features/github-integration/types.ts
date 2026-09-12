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
}
