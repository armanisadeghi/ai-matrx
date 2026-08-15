import type { Tables } from "@/types/database.types";

export type GitHubConnectionRow = Tables<
  { schema: "users" },
  "integration_connections"
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
