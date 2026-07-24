export type BingConnectionOwner =
  { type: "user" } | { type: "organization"; organizationId: string };

export interface BingConnectionSummary {
  id: string;
  owner_type: "user" | "organization";
  owner_user_id: string | null;
  organization_id: string | null;
  provider: "bing_webmaster";
  provider_subject: string;
  status: "connected" | "needs_attention" | "revoked" | "disconnected";
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface BingConnectionResource {
  id: string;
  connection_id: string;
  resource_type: "bing_webmaster_site";
  resource_ref: string;
  display_name: string;
  permission_level: string | null;
  discovered_at: string;
  metadata: Record<string, unknown>;
}

export interface BingConnectionInventory {
  connections: BingConnectionSummary[];
  resources: BingConnectionResource[];
}

export interface BingConnectionResult {
  connectionId: string;
}

/**
 * Mirrors the backend's `BingSiteBinding` shape exactly
 * (`aidream/services/seo/bing_webmaster.py`) — `extra="forbid"`, three
 * fields only. This is NOT the generic `ProviderIntegrationDraft` shape
 * (no `credential_authority`): the aidream Bing binding route is the sole
 * writer of `site.integrations.marketing.providers.bing_webmaster`.
 */
export interface BingSiteBinding {
  enabled: boolean;
  credential_ref: string;
  resource_ref: string;
}
