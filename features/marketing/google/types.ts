import { GOOGLE_SEARCH_CONSOLE_SCOPES } from "@/lib/googleScopes";

/** @deprecated Import the capability bundle from `@/lib/googleScopes`. */
export const GOOGLE_CONNECTION_SCOPES = GOOGLE_SEARCH_CONSOLE_SCOPES;

export type GoogleConnectionOwner =
  { type: "user" } | { type: "organization"; organizationId: string };

export interface GoogleConnectionSummary {
  id: string;
  owner_type: "user" | "organization";
  owner_user_id: string | null;
  organization_id: string | null;
  provider: "google";
  provider_subject: string;
  account_email: string | null;
  account_name: string | null;
  scopes: string[];
  status: "connected" | "needs_attention" | "revoked";
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  /**
   * True when the row still references a resolvable vault credential — the
   * stable `credential_item_id` OR the legacy `vault_secret_key`. This mirrors
   * aidream's `resolve_connection_credential` precondition EXACTLY (it raises
   * "has no vault credential — it needs re-authentication" only when both are
   * null), so the UI can state the failure before a sync is ever attempted
   * instead of discovering it mid-stream.
   */
  credential_present: boolean;
  /** True when the credential is the stable vault item, not the legacy key. */
  credential_stable: boolean;
  /**
   * Derived truth, not the stored `status`: a row can say `connected` while
   * having lost its credential (the exact state that produced the silent GSC
   * sync failures on 2026-07-25).
   */
  health: GoogleConnectionHealth;
}

export type GoogleConnectionHealth = "connected" | "needs_reauth" | "revoked";

export interface GoogleConnectionResource {
  id: string;
  connection_id: string;
  resource_type:
    | "search_console_property"
    | "analytics_property"
    | "youtube_channel"
    | "google_document"
    | "google_spreadsheet";
  resource_ref: string;
  display_name: string;
  permission_level: string | null;
  discovered_at: string;
  metadata: Record<string, unknown>;
}

export interface GoogleConnectionInventory {
  connections: GoogleConnectionSummary[];
  resources: GoogleConnectionResource[];
}

export interface GoogleConnectionResult {
  connectionId: string;
}
