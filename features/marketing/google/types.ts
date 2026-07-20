export const GOOGLE_IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

export const GOOGLE_SEARCH_CONSOLE_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export const GOOGLE_ANALYTICS_SCOPES = [
  ...GOOGLE_IDENTITY_SCOPES,
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

export const MARKETING_GOOGLE_SCOPES = [
  ...GOOGLE_SEARCH_CONSOLE_SCOPES,
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

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
}

export interface GoogleConnectionResource {
  id: string;
  connection_id: string;
  resource_type: "search_console_property" | "analytics_property";
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
