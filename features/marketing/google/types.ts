import type { ConnectionStatus } from "@/features/connectors/connection-status";
import {
  GOOGLE_WORKSPACE_RESOURCE_TYPES,
  type GoogleWorkspaceResourceType,
} from "@/features/google-workspace/resource-types";
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
  /**
   * The stored status, read through the ONE shared vocabulary
   * (`features/connectors/connection-status.ts`). `"unrecognized"` means the
   * deployed server wrote a word this build has never heard of — which is NOT
   * `connected`, and used to be collapsed into it (V17-1). The word itself is
   * kept on `status_as_read` for the operator surface.
   */
  status: ConnectionStatus | "unrecognized";
  /**
   * The status word the row actually carried, verbatim — for an OPERATOR surface
   * only (`googleConnectionDiagnostics`), never a person's sentence (D6).
   * Optional because a hand-built fixture has no column to have read; the one
   * reader of a row always sets it, and its reader falls back to `status`.
   */
  status_as_read?: string;
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
   * The server's per-capability call record for this connection, taken
   * straight from the generated `capability_health` column
   * (`users.integration_connections`). Open JSON on purpose: it is narrowed by
   * a runtime `__kind` guard in `features/connectors/google-capability-health.ts`,
   * never cast.
   */
  capability_health: unknown;
}

/**
 * DERIVED truth about one connection, never the stored status.
 *
 * `unavailable` is the third terminal word (chair ruling R22, 2026-09-18): the
 * provider or our own platform configuration blocks every call, and NOTHING the
 * person can press repairs it — so every surface renders it as blocked, with no
 * Reconnect and never the word "Connected" (V17-1).
 *
 * `unrecognized` is the honest answer to a status word this build has never heard
 * of: the two repos deploy independently, and a claim we cannot vouch for is
 * never rendered as a working connection.
 */
export type GoogleConnectionHealth =
  | "connected"
  | "needs_reauth"
  | "revoked"
  | "unavailable"
  | "unrecognized";

/** Canonical API descriptor; generated from aidream's Google capability model. */
export type GoogleCapabilityMetadata =
  components["schemas"]["GoogleCapabilityMetadata"];

/**
 * The resource types that are NOT Picker-chosen Workspace files — each
 * discovered from the provider's own API rather than chosen by a person.
 *
 * `calendar_event` (F-63): the server declared it attachable in
 * `aidream/services/conversation_attachments/attachable_resource_kinds.json`
 * (`record_table: "communication.calendar_event"`) — a synced agenda row, never
 * Picker-chosen — and its connector product is `calendar`
 * (`features/connectors/provider-config.ts`), already the product
 * `productKeyFor` resolves it to via the `calendar_event` alias in
 * `features/item-presentation/sourceHealth.ts`. Without an entry here,
 * `isGoogleConnectionResourceType("calendar_event")` was `false`, and
 * `connectionResource` throws on any type outside this list — the same class
 * of failure `google_presentation` hit in V13-3.
 */
const GOOGLE_MARKETING_RESOURCE_TYPES = [
  "search_console_property",
  "analytics_property",
  "youtube_channel",
  "calendar_event",
] as const;

/**
 * EVERY resource type a `users.integration_connection_resources` row may carry
 * for Google. The Workspace half is spread from the ONE file-type record
 * (`features/google-workspace/resource-types.ts`) rather than re-typed here:
 * this union used to hand-list "google_document | google_spreadsheet", so the
 * `google_presentation` row the server had already registered made
 * `connectionResource` THROW and took the entire inventory read — accounts,
 * properties, channels and files alike — down with it (V13-3).
 */
export type GoogleConnectionResourceType =
  | (typeof GOOGLE_MARKETING_RESOURCE_TYPES)[number]
  | GoogleWorkspaceResourceType;

export const GOOGLE_CONNECTION_RESOURCE_TYPES: readonly GoogleConnectionResourceType[] =
  [...GOOGLE_MARKETING_RESOURCE_TYPES, ...GOOGLE_WORKSPACE_RESOURCE_TYPES];

export function isGoogleConnectionResourceType(
  value: unknown,
): value is GoogleConnectionResourceType {
  return (
    typeof value === "string" &&
    (GOOGLE_CONNECTION_RESOURCE_TYPES as readonly string[]).includes(value)
  );
}

export interface GoogleConnectionResource {
  id: string;
  connection_id: string;
  resource_type: GoogleConnectionResourceType;
  resource_ref: string;
  display_name: string;
  permission_level: string | null;
  discovered_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Is this connected-resource row one of the Workspace files a person picks
 * through Google Picker? THE ONE narrowing predicate — every list, icon and
 * detail that switches on a file type goes through it, so adding a file type to
 * `features/google-workspace/resource-types.ts` widens all of them at once
 * instead of leaving a fourth surface filtering it out.
 */
export function isGoogleWorkspaceFileRow(
  row: GoogleConnectionResource,
): row is GoogleConnectionResource & {
  resource_type: GoogleWorkspaceResourceType;
} {
  return (GOOGLE_WORKSPACE_RESOURCE_TYPES as readonly string[]).includes(
    row.resource_type,
  );
}

export interface GoogleConnectionInventory {
  connections: GoogleConnectionSummary[];
  resources: GoogleConnectionResource[];
}

export interface GoogleConnectionResult {
  connectionId: string;
  /** Present only when the hub returned a valid per-product exchange result. */
  productOutcomeConfirmed: boolean;
  connectedCapabilityKeys: string[];
  refusedCapabilityKeys: string[];
}

/** Gmail read review contracts; kept local until the generated API snapshot is refreshed. */
export interface GmailMessageSummary {
  id: string;
  label_ids?: string[];
  thread_id: string | null;
  subject: string;
  from_address: string;
  to_address: string;
  date: string;
  snippet: string;
}

export interface GmailSearchResult {
  messages: GmailMessageSummary[];
  has_more: boolean;
  access_mode: "on_demand_read_only";
}

export interface GmailMessageDetail extends GmailMessageSummary {
  text_body: string;
  truncated: boolean;
  access_mode: "on_demand_read_only";
}

export type GmailModifyAction =
  | "archive"
  | "restore_inbox"
  | "mark_read"
  | "mark_unread"
  | "star"
  | "unstar"
  | "add_label"
  | "remove_label";

export interface GmailModifyResult {
  message_id: string;
  label_ids: string[];
}

export interface GmailLabelSummary {
  id: string;
  name: string;
  type: "user";
}

export interface GmailLabelsResult {
  labels: GmailLabelSummary[];
  has_more: boolean;
  next_offset: number | null;
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
