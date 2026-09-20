import type { ConnectionStatusReading } from "@/features/connectors/connection-status";
import type { Tables } from "@/types/database.types";

export const STORAGE_OAUTH_PROVIDERS = ["dropbox", "box"] as const;
export type StorageOAuthProvider = (typeof STORAGE_OAUTH_PROVIDERS)[number];

type IntegrationConnectionRow = Tables<
  { schema: "users" },
  "integration_connections"
>;

export type StorageConnectionRow = Pick<
  IntegrationConnectionRow,
  | "id"
  | "provider"
  | "account_email"
  | "account_name"
  | "scopes"
  | "status"
  | "last_verified_at"
  | "last_error"
  | "created_at"
  | "metadata"
>;

export interface StorageConnection {
  readonly id: string;
  readonly provider: StorageOAuthProvider;
  readonly accountEmail: string | null;
  readonly accountName: string | null;
  readonly scopes: readonly string[];
  readonly status: ConnectionStatusReading;
  readonly lastVerifiedAt: string | null;
  readonly lastError: string | null;
  readonly connectedAt: string | null;
  /** Safe lifecycle evidence only; arbitrary provider metadata never reaches UI. */
  readonly requestedScopes: readonly string[];
  readonly grantedScopes: readonly string[];
  readonly scopeEvidence: string | null;
}

export interface StorageAuthorizationStart {
  readonly authorizationUrl: string;
  readonly provider: StorageOAuthProvider;
  readonly requestedScopes: readonly string[];
}

export interface StorageLifecycleResult {
  readonly connectionId: string;
  readonly provider: StorageOAuthProvider;
  readonly status: string;
  readonly requestedScopes: readonly string[];
  readonly grantedScopes: readonly string[];
  readonly scopeEvidence: string;
  readonly providerRevoked: boolean | null;
}
