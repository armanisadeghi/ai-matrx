import type { Tables } from "@/types/database.types";

type IntegrationConnectionRow = Tables<
  { schema: "users" },
  "integration_connections"
>;

export type MicrosoftConnectionRow = Pick<
  IntegrationConnectionRow,
  | "id"
  | "owner_type"
  | "owner_user_id"
  | "provider"
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

/** One connected Microsoft work account, as a screen needs it. */
export interface MicrosoftConnection {
  readonly id: string;
  readonly accountEmail: string | null;
  readonly accountName: string | null;
  /** Delegated Graph scopes Microsoft actually returned, normalised. */
  readonly scopes: readonly string[];
  readonly status: string;
  readonly lastVerifiedAt: string | null;
  readonly lastError: string | null;
  readonly connectedAt: string | null;
}
