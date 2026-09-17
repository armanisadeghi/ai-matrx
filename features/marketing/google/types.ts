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
   * Client-safe generated fact: true when the row still references a
   * resolvable vault credential. The private reference identifiers never need
   * to enter the browser. This mirrors aidream's
   * `resolve_connection_credential` precondition EXACTLY, so the UI can state
   * the failure before a sync is attempted instead of discovering it
   * mid-stream.
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
  /**
   * The server's per-capability call record for this connection (see
   * `CapabilityHealthPending` below). Open JSON on purpose: it is narrowed by a
   * runtime `__kind` guard in `features/connectors/google-capability-health.ts`,
   * never cast.
   */
  capability_health: unknown;
}

/**
 * 🚨 A STAND-IN FOR A COLUMN THE GENERATED TYPES DO NOT CARRY YET, AND IT SAYS
 * SO. `users.integration_connections.capability_health` went live with
 * `0777_google_per_capability_call_health.sql`; `types/database.types.ts` was
 * last regenerated before it, so the generated `Row` has no such key.
 *
 * REMEDY, and the only one: run `pnpm db-types` (it needs the database
 * credentials this container does not hold), then delete this interface and
 * take the column from the generated row like every other one. A compile-time
 * guard in `features/marketing/google/service.ts` FAILS the moment the
 * generated row gains the column, so this stand-in cannot outlive its reason.
 *
 * It is deliberately `unknown`, not a hand-mirrored shape: hand-mirroring a
 * generated type is the drift this repo's type standard bans, and the value is
 * jsonb that must be narrowed at runtime anyway.
 */
export interface CapabilityHealthPending {
  capability_health: unknown;
}

export type GoogleConnectionHealth = "connected" | "needs_reauth" | "revoked";

/** Canonical API descriptor; generated from aidream's Google capability model. */
export type GoogleCapabilityMetadata =
  components["schemas"]["GoogleCapabilityMetadata"];

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

export type CalendarAgendaEvent = components["schemas"]["CalendarAgendaEvent"];

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

export type GoogleTasksPreview = components["schemas"]["GoogleTasksPreview"];

export type YouTubeAnalyticsDay = components["schemas"]["YouTubeAnalyticsDay"];

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

export type TagManagerInventory = components["schemas"]["TagManagerInventory"];

export type GoogleAdsCustomer = components["schemas"]["GoogleAdsCustomer"];

export type GoogleAdsCustomerInventory =
  components["schemas"]["GoogleAdsCustomerInventory"];

export type GoogleAdsCampaignMetric =
  components["schemas"]["GoogleAdsCampaignMetric"];

export type GoogleAdsReport = components["schemas"]["GoogleAdsReport"];
