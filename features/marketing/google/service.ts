import { createClient } from "@/utils/supabase/client";
import { BackendApiError, parseHttpError } from "@/lib/api/errors";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
  GoogleConnectionInventory,
  GoogleConnectionOwner,
  GoogleConnectionResult,
  YouTubeChannelPreview,
  GoogleAdsCustomerInventory,
  GoogleAdsReport,
  CalendarAgendaPreview,
  GoogleTasksPreview,
  TagManagerInventory,
  YouTubeAnalyticsPreview,
} from "@/features/marketing/google/types";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  applyOrganizationContextHeader,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
// Keep this small exchange control local rather than deriving it from the
// deployed OpenAPI snapshot: the frontend and backend deploy independently,
// and a newly added fail-closed purpose must be usable as soon as both source
// commits exist even while production type synchronization catches up.
export type GoogleConnectionPurpose =
  | "general"
  | "google_ads_isolated"
  | "read_only_sweep";

/**
 * A connection/resource can disappear between the RLS-scoped inventory read
 * and a deliberate preview click (membership removed, connection revoked, or
 * resource reconciled by a fresh OAuth grant). Those 403/404 responses are
 * stale-selection control flow, not a product crash.
 */
export function isStaleGoogleConnectionSelection(error: unknown): boolean {
  return (
    error instanceof BackendApiError &&
    (error.status === 403 || error.status === 404)
  );
}

/**
 * Admin RLS can expose connections owned by other users and organizations.
 * Preview surfaces must mirror aidream's user-keyed reachability boundary
 * before selecting a credential, rather than treating every RLS-visible row
 * as callable by the current user.
 */
export function isGoogleConnectionReachableByUser(
  connection: GoogleConnectionSummary,
  userId: string | null,
  organizationIds: readonly string[],
): boolean {
  if (!userId) return false;
  if (connection.owner_user_id === userId) return true;
  return Boolean(
    connection.organization_id &&
      organizationIds.includes(connection.organization_id),
  );
}

/**
 * Super-admin RLS intentionally exposes other owners' integration rows for
 * administration. Product pickers are user actions, so their inventory must
 * remove those rows before capability selection; otherwise a foreign row can
 * look eligible and fail only after the broker enforces ownership.
 */
export function filterGoogleConnectionInventoryForUser(
  inventory: GoogleConnectionInventory,
  userId: string | null,
  organizationIds: readonly string[],
): GoogleConnectionInventory {
  const connections = inventory.connections.filter((connection) =>
    isGoogleConnectionReachableByUser(connection, userId, organizationIds),
  );
  const connectionIds = new Set(connections.map((connection) => connection.id));
  return {
    connections,
    resources: inventory.resources.filter((resource) =>
      connectionIds.has(resource.connection_id),
    ),
  };
}

// `credential_item_id` / `vault_secret_key` are REFERENCES, never secrets (a
// vault item id and a key name). Reading them is what lets the UI tell the
// truth about a connection's health without a server round-trip.
const CONNECTION_SELECT =
  "id, owner_type, owner_user_id, organization_id, provider, provider_subject, account_email, account_name, scopes, status, last_verified_at, last_error, created_at, updated_at, metadata, credential_item_id, vault_secret_key";
const RESOURCE_SELECT =
  "id, connection_id, resource_type, resource_ref, display_name, permission_level, discovered_at, metadata";

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

type ConnectionRow = {
  id: string;
  owner_type: string;
  owner_user_id: string | null;
  organization_id: string | null;
  provider: string;
  provider_subject: string;
  account_email: string | null;
  account_name: string | null;
  scopes: string[];
  status: string;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  metadata: unknown;
  credential_item_id: string | null;
  vault_secret_key: string | null;
};

export type GoogleConnectionResourceRow = {
  id: string;
  connection_id: string;
  resource_type: string;
  resource_ref: string;
  display_name: string;
  permission_level: string | null;
  discovered_at: string;
  metadata: unknown;
};

function connectionSummary(row: ConnectionRow): GoogleConnectionSummary {
  const status =
    row.status === "needs_attention" || row.status === "revoked"
      ? row.status
      : "connected";
  const credentialPresent = Boolean(
    row.credential_item_id || row.vault_secret_key,
  );
  return {
    ...row,
    owner_type: row.owner_type === "organization" ? "organization" : "user",
    provider: "google",
    status,
    metadata: recordValue(row.metadata),
    credential_present: credentialPresent,
    credential_stable: Boolean(row.credential_item_id),
    // A row whose credential reference is gone CANNOT authorize anything, no
    // matter what `status` claims — parity with aidream's precondition.
    health:
      status === "revoked"
        ? "revoked"
        : credentialPresent && status === "connected"
          ? "connected"
          : "needs_reauth",
  };
}

export function connectionResource(
  row: GoogleConnectionResourceRow,
): GoogleConnectionResource {
  if (
    row.resource_type !== "search_console_property" &&
    row.resource_type !== "analytics_property" &&
    row.resource_type !== "youtube_channel" &&
    row.resource_type !== "google_document" &&
    row.resource_type !== "google_spreadsheet"
  ) {
    throw new Error(
      `Unknown Google connection resource type: ${row.resource_type}`,
    );
  }
  return {
    ...row,
    resource_type: row.resource_type,
    metadata: recordValue(row.metadata),
  };
}

export async function listGoogleConnectionInventory(
  signal?: AbortSignal,
): Promise<GoogleConnectionInventory> {
  const supabase = createClient();
  const connections = await supabase
    .schema("users")
    .from("integration_connections")
    .select(CONNECTION_SELECT)
    .eq("provider", "google")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .abortSignal(signal ?? new AbortController().signal);
  if (connections.error) throw new Error(connections.error.message);

  const ids = connections.data.map((connection) => connection.id);
  if (!ids.length) return { connections: [], resources: [] };
  const resources = await supabase
    .schema("users")
    .from("integration_connection_resources")
    .select(RESOURCE_SELECT)
    .in("connection_id", ids)
    .is("deleted_at", null)
    .order("resource_type", { ascending: true })
    .order("display_name", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  if (resources.error) throw new Error(resources.error.message);

  return {
    connections: connections.data.map(connectionSummary),
    resources: resources.data.map(connectionResource),
  };
}

// The Google credential control plane lives on aidream ("the brain"): it
// exchanges the one-time code, stores the refresh token in the CANONICAL
// secrets vault (user vault / organization vault), and keeps only safe
// metadata + a vault reference in users.integration_connections. The browser
// calls aidream directly with the caller's Supabase JWT — no Next.js hop and
// no client-side secret handling.

function backendBase(): string {
  return AIDREAM_PRODUCTION_URL;
}

/**
 * Organization admission rides with auth: aidream's AuthMiddleware
 * (matrx-connect, 2026-08-30) refuses any Bearer-JWT request that names no
 * organization via `X-Organization-Id`. Every call here is identified, so the
 * currently selected organization is resolved through the ONE fail-closed
 * kernel — a missing organization throws `OrganizationContextError` (with the
 * select-an-organization remedy) BEFORE any networking. Same pattern as
 * `features/marketing/seo/dataforseo/client.ts`.
 */
function organizationContextHeaders(
  base: Record<string, string>,
): Record<string, string> {
  const store = getStoreSingleton();
  const organizationId = requireOrganizationContext(
    store ? selectOrganizationId(store.getState()) : null,
  );
  return applyOrganizationContextHeader(base, organizationId);
}

export async function postGoogleBackend(
  path: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to manage Google.");
  const response = await fetch(`${backendBase()}${path}`, {
    method: "POST",
    headers: organizationContextHeaders({
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await parseHttpError(response);
    throw error.message === `Request failed (${response.status})`
      ? new Error(fallback, { cause: error })
      : error;
  }
  return response;
}

export async function connectGoogle(
  code: string,
  owner: GoogleConnectionOwner,
  connectionPurpose: GoogleConnectionPurpose = "general",
): Promise<GoogleConnectionResult> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Google OAuth is not configured on this deployment.");
  }
  const response = await postGoogleBackend(
    "/api/google-integrations/exchange",
    {
      code,
      client_id: clientId,
      owner_type: owner.type,
      organization_id:
        owner.type === "organization" ? owner.organizationId : null,
      redirect_uri: window.location.origin,
      connection_purpose: connectionPurpose,
    },
    "Unable to connect Google.",
  );
  const body = (await response.json()) as { connection_id?: unknown };
  if (typeof body.connection_id !== "string") {
    throw new Error("Google connected without returning a connection ID.");
  }
  return { connectionId: body.connection_id };
}

export async function disconnectGoogle(connectionId: string): Promise<void> {
  await postGoogleBackend(
    "/api/google-integrations/disconnect",
    { connection_id: connectionId },
    "Unable to disconnect Google.",
  );
}

export async function getYouTubeChannelPreview(
  connectionId: string,
  channelId: string,
  organizationId?: string | null,
): Promise<YouTubeChannelPreview> {
  const response = await postGoogleBackend(
    "/api/google-integrations/youtube/preview",
    {
      connection_id: connectionId,
      channel_id: channelId,
      organization_id: organizationId ?? null,
    },
    "Unable to read the selected YouTube channel.",
  );
  return (await response.json()) as YouTubeChannelPreview;
}

export async function getGoogleAdsCustomers(
  connectionId: string,
  organizationId?: string | null,
): Promise<GoogleAdsCustomerInventory> {
  const response = await postGoogleBackend(
    "/api/google-integrations/ads/customers",
    {
      connection_id: connectionId,
      organization_id: organizationId ?? null,
    },
    "Unable to discover Google Ads accounts.",
  );
  return (await response.json()) as GoogleAdsCustomerInventory;
}

export async function getGoogleAdsReport(input: {
  connectionId: string;
  customerId: string;
  loginCustomerId: string;
  startDate: string;
  endDate: string;
  organizationId?: string | null;
}): Promise<GoogleAdsReport> {
  const response = await postGoogleBackend(
    "/api/google-integrations/ads/report",
    {
      connection_id: input.connectionId,
      customer_id: input.customerId,
      login_customer_id: input.loginCustomerId,
      start_date: input.startDate,
      end_date: input.endDate,
      organization_id: input.organizationId ?? null,
    },
    "Unable to load the selected Google Ads report.",
  );
  return (await response.json()) as GoogleAdsReport;
}

export async function getGoogleCalendarAgenda(input: {
  connectionId: string;
  days?: number;
  organizationId?: string | null;
}): Promise<CalendarAgendaPreview> {
  const response = await postGoogleBackend(
    "/api/google-integrations/calendar/agenda",
    {
      connection_id: input.connectionId,
      organization_id: input.organizationId ?? null,
      days: input.days ?? 14,
    },
    "Unable to read the primary Google Calendar agenda.",
  );
  return (await response.json()) as CalendarAgendaPreview;
}

export async function getGoogleTasksPreview(input: {
  connectionId: string;
  organizationId?: string | null;
}): Promise<GoogleTasksPreview> {
  const response = await postGoogleBackend(
    "/api/google-integrations/tasks/preview",
    {
      connection_id: input.connectionId,
      organization_id: input.organizationId ?? null,
    },
    "Unable to read Google Tasks.",
  );
  return (await response.json()) as GoogleTasksPreview;
}

export async function getYouTubeAnalyticsPreview(input: {
  connectionId: string;
  channelId: string;
  startDate: string;
  endDate: string;
  organizationId?: string | null;
}): Promise<YouTubeAnalyticsPreview> {
  const response = await postGoogleBackend(
    "/api/google-integrations/youtube/analytics",
    {
      connection_id: input.connectionId,
      channel_id: input.channelId,
      start_date: input.startDate,
      end_date: input.endDate,
      organization_id: input.organizationId ?? null,
    },
    "Unable to read YouTube Analytics.",
  );
  return (await response.json()) as YouTubeAnalyticsPreview;
}

export async function getTagManagerInventory(input: {
  connectionId: string;
  organizationId?: string | null;
}): Promise<TagManagerInventory> {
  const response = await postGoogleBackend(
    "/api/google-integrations/tag-manager/inventory",
    {
      connection_id: input.connectionId,
      organization_id: input.organizationId ?? null,
    },
    "Unable to read Google Tag Manager.",
  );
  return (await response.json()) as TagManagerInventory;
}
