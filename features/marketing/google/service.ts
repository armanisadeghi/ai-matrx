import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { BackendApiError, parseHttpError } from "@/lib/api/errors";
import type { Database } from "@/types/database.types";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
  GoogleConnectionInventory,
  GoogleConnectionOwner,
  GoogleConnectionResult,
  GoogleCapabilityMetadata,
  YouTubeChannelPreview,
  GoogleAdsCustomerInventory,
  GoogleAdsReport,
  CalendarAgendaPreview,
  GoogleTasksPreview,
  TagManagerInventory,
  YouTubeAnalyticsPreview,
  GmailSearchResult,
  GmailMessageDetail,
} from "@/features/marketing/google/types";
import { isGoogleConnectionResourceType } from "@/features/marketing/google/types";
import { readConnectionStatus } from "@/features/connectors/connection-status";
import {
  googleAccountFault,
  googleFaultBlocksEverything,
} from "@/features/marketing/google/health";
import { readAllRows } from "@ai-matrx/data/db";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { ensureOrganizationForRequest } from "@/lib/organization/organization-gate";
import { operationFailed } from "@/utils/errors";
// Keep this small exchange control local rather than deriving it from the
// deployed OpenAPI snapshot: the frontend and backend deploy independently,
// and a newly added fail-closed purpose must be usable as soon as both source
// commits exist even while production type synchronization catches up.
export type GoogleConnectionPurpose =
  | "general"
  | "google_ads_isolated"
  | "read_only_sweep"
  | "contacts_import"
  | "google_capability"
  // The multi-product consent behind the connector primitive's one button:
  // `capability_keys` names every switched-on product, the hub creates the
  // connection on a first connect and adds only those products' scopes to an
  // existing one, refusing by name any scope outside the selection and any
  // request that would drop a scope the connection already holds.
  // Contract: common-docs/projects/google-native/PLAN.md §2 + §5.2.
  | "google_products";

export type GoogleCapabilityKey =
  "contacts" | "calendar" | "tasks" | "tag_manager" | "youtube_analytics";

/** Preserve every existing grant while an explicit feature adds its own scope. */
export function cumulativeGoogleReconnectScopes(
  existingScopes: readonly string[],
  requestedFeatureScopes: readonly string[],
): string[] {
  return [...new Set([...existingScopes, ...requestedFeatureScopes])];
}

export function buildGoogleReconnectRequest(
  connection: GoogleConnectionSummary,
  requestedFeatureScopes: readonly string[] = [],
  capabilityKey?: GoogleCapabilityKey,
): {
  scopes: string[];
  loginHint: string | undefined;
  owner: GoogleConnectionOwner;
  options: { targetConnectionId: string; capabilityKey?: GoogleCapabilityKey };
} {
  const options = {
    targetConnectionId: connection.id,
    ...(capabilityKey ? { capabilityKey } : {}),
  };
  if (connection.owner_type === "organization") {
    if (!connection.organization_id) {
      throw new Error(
        "This shared Google connection no longer names its organization.",
      );
    }
    return {
      scopes: cumulativeGoogleReconnectScopes(
        connection.scopes,
        requestedFeatureScopes,
      ),
      loginHint: connection.account_email ?? undefined,
      owner: {
        type: "organization",
        organizationId: connection.organization_id,
      },
      options,
    };
  }
  return {
    scopes: cumulativeGoogleReconnectScopes(
      connection.scopes,
      requestedFeatureScopes,
    ),
    loginHint: connection.account_email ?? undefined,
    owner: { type: "user" },
    options,
  };
}

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

// The vault reference identifiers are deliberately not client-readable. These
// generated facts let the UI report connection health without disclosing a
// credential item id or vault key name.
const CONNECTION_SELECT =
  "id, owner_type, owner_user_id, organization_id, provider, provider_subject, account_email, account_name, scopes, status, last_verified_at, last_error, created_at, updated_at, metadata, credential_present, credential_stable, capability_health";

const RESOURCE_SELECT =
  "id, connection_id, resource_type, resource_ref, display_name, permission_level, discovered_at, metadata";

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

type GeneratedConnectionRow =
  Database["users"]["Tables"]["integration_connections"]["Row"];

/**
 * The row shape this query selects, taken from the generated
 * `integration_connections` row now that `capability_health` is part of it —
 * `CONNECTION_SELECT` names every field below and postgrest-js infers the
 * result directly, no `.returns<>()` needed.
 */
export type ConnectionRow = Pick<
  GeneratedConnectionRow,
  | "id"
  | "owner_type"
  | "owner_user_id"
  | "organization_id"
  | "provider"
  | "provider_subject"
  | "account_email"
  | "account_name"
  | "scopes"
  | "status"
  | "last_verified_at"
  | "last_error"
  | "created_at"
  | "updated_at"
  | "metadata"
  | "credential_present"
  | "credential_stable"
  | "capability_health"
>;

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

/**
 * The ONE reader of a connection row. Exported because the derivation IS the
 * thing under test in `features/connectors/__tests__/
 * a-blocked-configuration-is-never-connected.test.tsx`: a test that hand-set
 * `health` would prove nothing about the status word it is judging (V17-1).
 */
export function connectionSummary(row: ConnectionRow): GoogleConnectionSummary {
  // 🚨 EVERY WORD THIS DOES NOT RECOGNISE USED TO BECOME `connected` (V17-1).
  // The column is written by aidream and the two repos deploy independently, so
  // the day the server gained `unavailable` — "the provider or our own platform
  // configuration blocks every call" — this function would have painted the
  // green badge over it. The vocabulary is shared and read once
  // (`features/connectors/connection-status.ts`); a word we have no branch for
  // is `unrecognized`, which is never usable.
  const reading = readConnectionStatus(row.status);
  const status = reading.status ?? "unrecognized";
  const credentialPresent = row.credential_present === true;
  const metadata = recordValue(row.metadata);
  const summary: GoogleConnectionSummary = {
    ...row,
    owner_type: row.owner_type === "organization" ? "organization" : "user",
    provider: "google",
    status,
    status_as_read: reading.asRead,
    metadata,
    credential_present: credentialPresent,
    credential_stable: row.credential_stable === true,
    health: "needs_reauth",
  };
  return { ...summary, health: derivedHealth(summary) };
}

/**
 * DERIVED truth, never the stored word — the same principle that has always
 * made a credential-less row `needs_reauth` however loudly `status` said
 * `connected` (the silent GSC failures of 2026-07-25).
 *
 * The blocked reading is the V17-1 fix: Google rejecting AI Matrx's own OAuth
 * client configuration is deliberately NOT a credential failure, so the row stays
 * `connected` today, and the card printed "Connected" ten times and "9 of 9
 * products in use" directly above its own sentence saying no Google account
 * could be used. A fault the vocabulary declares remedy-less means nothing the
 * person can press repairs it, which IS `unavailable` — so the row is read that
 * way whether or not the server has restamped it (lane B-23 makes `status_for`
 * write the word; this does not wait for it and does not disagree with it).
 */
function derivedHealth(
  summary: GoogleConnectionSummary,
): GoogleConnectionSummary["health"] {
  if (summary.status === "unrecognized") return "unrecognized";
  if (summary.status === "unavailable") return "unavailable";
  if (summary.status === "revoked" || summary.status === "disconnected") {
    return "revoked";
  }
  if (googleFaultBlocksEverything(googleAccountFault(summary))) {
    return "unavailable";
  }
  // A row whose credential reference is gone CANNOT authorize anything, no
  // matter what `status` claims — parity with aidream's precondition.
  return summary.credential_present && summary.status === "connected"
    ? "connected"
    : "needs_reauth";
}

export function connectionResource(
  row: GoogleConnectionResourceRow,
): GoogleConnectionResource {
  // The set is DERIVED (`GOOGLE_CONNECTION_RESOURCE_TYPES`), never re-typed
  // here: this guard hand-listed five types, so the `google_presentation` row
  // the server registers threw and one deck emptied every Google surface in the
  // app. It still throws on a genuinely unknown type — that is a row shape we
  // cannot render, and a silent drop would hide the connected resource.
  if (!isGoogleConnectionResourceType(row.resource_type)) {
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { connections: [], resources: [] };

  // 🚨 BOTH READS ARE TREATED AS COMPLETE, SO BOTH PAGE (CLAUDE.md § readAllRows,
  // and VERIFY-U-P2-R5 V17-7). PostgREST caps a response at 1000 rows without
  // erroring, and these two arrays are not merely rendered: the connection ids
  // become the resource filter, the resources are COUNTED per account, and that
  // count is the consequence a person weighs a Disconnect against
  // ("The N items you picked with this account stop resolving…" —
  // `revokeConsequence`). At 313 undeleted resource rows today it is latent; the
  // first account to cross the cap would have quietly under-stated what a
  // destructive press destroys, and the attach and review lists would have been
  // short with nothing saying so.
  const abortSignal = signal ?? new AbortController().signal;
  let connections: ConnectionRow[];
  try {
    connections = await readAllRows<ConnectionRow>(
      ({ from, to }) =>
        supabase
          .schema("users")
          .from("integration_connections")
          .select(CONNECTION_SELECT, { count: "exact" })
          .eq("provider", "google")
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          // A stable total order, required by the pager: `updated_at` is not
          // unique, so the id breaks every tie.
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(abortSignal)
          .returns<ConnectionRow[]>(),
      { label: "users.integration_connections (google)" },
    );
  } catch (error) {
    throw operationFailed("load your Google connections", error);
  }

  const ids = connections.map((connection) => connection.id);
  if (!ids.length) return { connections: [], resources: [] };
  let resourceRows: GoogleConnectionResourceRow[];
  try {
    resourceRows = await readAllRows<GoogleConnectionResourceRow>(
      ({ from, to }) =>
        supabase
          .schema("users")
          .from("integration_connection_resources")
          .select(RESOURCE_SELECT, { count: "exact" })
          .in("connection_id", ids)
          .is("deleted_at", null)
          .order("resource_type", { ascending: true })
          .order("display_name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(abortSignal)
          .returns<GoogleConnectionResourceRow[]>(),
      { label: "users.integration_connection_resources (google)" },
    );
  } catch (error) {
    throw operationFailed("load your Google connection details", error);
  }

  return {
    connections: connections.map(connectionSummary),
    resources: resourceRows.map(connectionResource),
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
async function organizationContextHeaders(
  base: Record<string, string>,
  request: { method: string; interactive?: boolean },
  organizationIdOverride?: string,
): Promise<Record<string, string>> {
  // ORG-GATE-AUDIT: THE GATE, never the bare kernel. A Google write the person
  // pressed (connect, create a Doc, send a reviewed email, apply an approval)
  // with no organization selected asks, then continues this same request; a
  // read — including the read-shaped POSTs below — keeps the fail-closed
  // refusal and never raises a dialog on mount.
  const organizationId = await ensureOrganizationForRequest({
    method: request.method,
    interactive: request.interactive,
    organizationId: organizationIdOverride,
  });
  return applyOrganizationContextHeader(base, organizationId);
}

/**
 * POST routes that are READS (a search, a preview, a report): components fetch
 * them on mount and on refresh, so a missing organization must never open the
 * picker from them — the screen's own organization notice answers instead.
 */
const READ_SHAPED_GOOGLE_POSTS: readonly string[] = [
  "/api/google-integrations/gmail/search",
  "/api/google-integrations/gmail/message",
  "/api/google-integrations/youtube/preview",
  "/api/google-integrations/youtube/analytics",
  "/api/google-integrations/ads/customers",
  "/api/google-integrations/ads/report",
  "/api/google-integrations/calendar/agenda",
  "/api/google-integrations/tasks/preview",
  "/api/google-integrations/tag-manager/inventory",
  "/api/google-workspace/sheets/read",
];

function googlePostAsks(path: string): boolean {
  return !READ_SHAPED_GOOGLE_POSTS.some((read) => path.startsWith(read));
}

export async function postGoogleBackend(
  path: string,
  body: Record<string, unknown>,
  fallback: string,
  organizationIdOverride?: string,
  expectedUserId?: string,
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to manage Google.");
  if (expectedUserId) {
    // WHO the bearer token names is decided by its own VERIFIED claims, never
    // by `session.user`, which is whatever the cookie deserialized to.
    const { data: claims, error: claimsError } = await getClaimsUser(
      supabase,
      session.access_token,
    );
    if (claimsError) {
      throw new Error(
        "Your AI Matrx identity could not be verified just now. No Google access was saved; try again in a moment.",
        { cause: claimsError },
      );
    }
    if (claims.user?.id !== expectedUserId) {
      throw new Error(
        "Your AI Matrx session changed while Google authorization was open. No Google access was saved; try again from the original session.",
      );
    }
  }
  const response = await fetch(`${backendBase()}${path}`, {
    method: "POST",
    headers: await organizationContextHeaders(
      {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      { method: "POST", interactive: googlePostAsks(path) },
      organizationIdOverride,
    ),
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

export async function getGoogleBackend(
  path: string,
  fallback: string,
  signal?: AbortSignal,
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to manage Google.");
  const response = await fetch(`${backendBase()}${path}`, {
    method: "GET",
    headers: await organizationContextHeaders(
      { Authorization: `Bearer ${session.access_token}` },
      { method: "GET" },
    ),
    signal,
  });
  if (!response.ok) {
    const error = await parseHttpError(response);
    throw error.message === `Request failed (${response.status})`
      ? new Error(fallback, { cause: error })
      : error;
  }
  return response;
}

export async function listGoogleCapabilities(
  signal?: AbortSignal,
): Promise<GoogleCapabilityMetadata[]> {
  const response = await getGoogleBackend(
    "/api/google-integrations/capabilities",
    "Unable to load Google capability availability.",
    signal,
  );
  return (await response.json()) as GoogleCapabilityMetadata[];
}

export async function connectGoogle(
  code: string,
  owner: GoogleConnectionOwner,
  connectionPurpose: GoogleConnectionPurpose = "general",
  options?: {
    redirectUri?: string;
    organizationContextId?: string;
    expectedUserId?: string;
    targetConnectionId?: string;
    capabilityKey?: GoogleCapabilityKey;
    /** `google_products` only: every catalog key the person switched on. */
    capabilityKeys?: readonly string[];
  },
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
      redirect_uri: options?.redirectUri ?? window.location.origin,
      connection_purpose: connectionPurpose,
      target_connection_id: options?.targetConnectionId,
      capability_key: options?.capabilityKey,
      capability_keys: options?.capabilityKeys
        ? [...options.capabilityKeys]
        : undefined,
    },
    "Unable to connect Google.",
    options?.organizationContextId,
    options?.expectedUserId,
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

/** A fresh bounded Gmail read; queries and messages stay out of local storage. */
export async function searchGmail(
  connectionId: string,
  query: string,
): Promise<GmailSearchResult> {
  const response = await postGoogleBackend(
    "/api/google-integrations/gmail/search",
    { connection_id: connectionId, query },
    "Gmail search could not finish. Try again.",
  );
  return (await response.json()) as GmailSearchResult;
}

export async function readGmailMessage(
  connectionId: string,
  messageId: string,
): Promise<GmailMessageDetail> {
  const response = await postGoogleBackend(
    "/api/google-integrations/gmail/message",
    { connection_id: connectionId, message_id: messageId },
    "This Gmail message could not open. Try again.",
  );
  return (await response.json()) as GmailMessageDetail;
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
