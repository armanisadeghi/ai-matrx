import { GOOGLE_SEARCH_CONSOLE_SCOPES } from "@/lib/googleScopes";
import type { components } from "@/types/python-generated/api-types";

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

export interface YouTubeVideoPreview {
  video_id: string;
  title: string;
  published_at: string | null;
  description: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  privacy_status: string | null;
}

export interface YouTubeChannelPreview {
  channel_id: string;
  title: string;
  description: string | null;
  custom_url: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  view_count: number | null;
  video_count: number | null;
  recent_videos: YouTubeVideoPreview[];
}

export type CalendarAgendaEvent =
  components["schemas"]["CalendarAgendaEvent"];

export type CalendarAgendaPreview =
  components["schemas"]["CalendarAgendaPreview"];

export interface GoogleTaskItemPreview {
  task_id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  completed_at: string | null;
  status: string | null;
  parent_task_id: string | null;
  position: string | null;
}

export type GoogleTaskListPreview =
  components["schemas"]["GoogleTaskListPreview"];

export type GoogleTasksPreview =
  components["schemas"]["GoogleTasksPreview"];

export type YouTubeAnalyticsDay =
  components["schemas"]["YouTubeAnalyticsDay"];

export type YouTubeAnalyticsPreview =
  components["schemas"]["YouTubeAnalyticsPreview"];

export interface TagManagerWorkspacePreview {
  workspace_id: string;
  name: string;
}

export interface TagManagerContainerPreview {
  container_id: string;
  name: string;
  public_id: string | null;
  usage_context: string[];
  workspaces: TagManagerWorkspacePreview[];
}

export interface TagManagerAccountPreview {
  account_id: string;
  name: string;
  containers: TagManagerContainerPreview[];
}

export type TagManagerInventory =
  components["schemas"]["TagManagerInventory"];

export type GoogleAdsCustomer = components["schemas"]["GoogleAdsCustomer"];

export type GoogleAdsCustomerInventory =
  components["schemas"]["GoogleAdsCustomerInventory"];

export type GoogleAdsCampaignMetric =
  components["schemas"]["GoogleAdsCampaignMetric"];

export type GoogleAdsReport = components["schemas"]["GoogleAdsReport"];
