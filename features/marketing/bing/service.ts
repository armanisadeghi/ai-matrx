import { createClient } from "@/utils/supabase/client";
import { callApi } from "@/lib/api/call-api";
import { parseStreamError } from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";
import type {
  BingConnectionInventory,
  BingConnectionOwner,
  BingConnectionResource,
  BingConnectionResult,
  BingConnectionSummary,
  BingSiteBinding,
} from "@/features/marketing/bing/types";

const CONNECTION_SELECT =
  "id, owner_type, owner_user_id, organization_id, provider, provider_subject, status, last_verified_at, last_error, created_at, updated_at, metadata";
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
  status: string;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  metadata: unknown;
};

type ResourceRow = {
  id: string;
  connection_id: string;
  resource_type: string;
  resource_ref: string;
  display_name: string;
  permission_level: string | null;
  discovered_at: string;
  metadata: unknown;
};

function connectionSummary(row: ConnectionRow): BingConnectionSummary {
  return {
    ...row,
    owner_type: row.owner_type === "organization" ? "organization" : "user",
    provider: "bing_webmaster",
    status:
      row.status === "needs_attention" ||
      row.status === "revoked" ||
      row.status === "disconnected"
        ? row.status
        : "connected",
    metadata: recordValue(row.metadata),
  };
}

function connectionResource(row: ResourceRow): BingConnectionResource {
  return {
    ...row,
    resource_type: "bing_webmaster_site",
    metadata: recordValue(row.metadata),
  };
}

/** Direct Supabase read (same doctrine as Google): the browser reads the
 * connection inventory straight from `users.integration_connections` /
 * `..._resources` under RLS — never proxied through aidream. Only the
 * credential-bearing lifecycle calls (connect/bind/disconnect) go to
 * aidream. */
export async function listBingConnectionInventory(
  signal?: AbortSignal,
): Promise<BingConnectionInventory> {
  const supabase = createClient();
  const connections = await supabase
    .schema("users")
    .from("integration_connections")
    .select(CONNECTION_SELECT)
    .eq("provider", "bing_webmaster")
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
    .order("display_name", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  if (resources.error) throw new Error(resources.error.message);

  return {
    connections: connections.data.map(connectionSummary),
    resources: resources.data.map(connectionResource),
  };
}

// The Bing credential control plane lives on aidream ("the brain"): it
// stores the API key or the OAuth token bundle in the CANONICAL secrets
// vault (user vault / organization vault) and keeps only safe metadata + a
// vault reference in users.integration_connections. The browser calls
// aidream directly with the caller's Supabase JWT — no Next.js hop and no
// client-side secret handling beyond the one-time submit.

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function aidreamPost(
  path: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to manage Bing Webmaster.");
  const response = await fetch(`${backendBase()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: unknown;
    };
    const detail =
      typeof payload.detail === "string"
        ? payload.detail
        : typeof (payload.detail as { message?: unknown })?.message === "string"
          ? ((payload.detail as { message: string }).message as string)
          : fallback;
    throw new Error(detail);
  }
  return response;
}

function ownerBody(owner: BingConnectionOwner): Record<string, unknown> {
  return {
    owner_type: owner.type,
    organization_id: owner.type === "organization" ? owner.organizationId : null,
  };
}

export async function connectBingApiKey(
  apiKey: string,
  owner: BingConnectionOwner,
): Promise<BingConnectionResult> {
  const response = await aidreamPost(
    "/api/bing-integrations/api-key",
    { api_key: apiKey, ...ownerBody(owner) },
    "Unable to connect Bing Webmaster.",
  );
  const body = (await response.json()) as { connection_id?: unknown };
  if (typeof body.connection_id !== "string") {
    throw new Error("Bing Webmaster connected without returning a connection ID.");
  }
  return { connectionId: body.connection_id };
}

export async function bindBingSite(params: {
  organizationId: string;
  siteId: string;
  connectionId: string;
  resourceRef: string;
}): Promise<BingSiteBinding> {
  const response = await aidreamPost(
    "/api/bing-integrations/bind-site",
    {
      organization_id: params.organizationId,
      site_id: params.siteId,
      connection_id: params.connectionId,
      resource_ref: params.resourceRef,
    },
    "Unable to bind the Bing Webmaster site.",
  );
  return (await response.json()) as BingSiteBinding;
}

export interface BingSyncCallbacks {
  signal?: AbortSignal;
  onEvent?: (event: TypedStreamEvent) => void;
}

export interface BingSyncResult {
  runId: string | null;
}

/**
 * On-demand streamed Bing Webmaster SEARCH_PERFORMANCE collection for one
 * bound site — `POST /seo/sites/{site_id}/bing/search-performance/sync`
 * (WS-9 / M-69 / DEF-14). Detached NDJSON: the collection persists rows
 * into `seo.search_performance_daily` (bing-attributed) even if the
 * caller disconnects; this just follows the live stream.
 */
export async function syncBingSearchPerformance(
  dispatch: AppDispatch,
  siteId: string,
  organizationId: string,
  options: { windowDays?: number } = {},
  callbacks: BingSyncCallbacks = {},
): Promise<BingSyncResult> {
  let runId: string | null = null;
  let streamError: Error | null = null;
  const response = await dispatch(
    callApi({
      path: "/seo/sites/{site_id}/bing/search-performance/sync",
      method: "POST",
      pathParams: { site_id: siteId },
      body: { window_days: options.windowDays ?? 28 },
      scopeOverrides: { organization_id: organizationId },
      stream: true,
      signal: callbacks.signal,
      onStreamEvent: (event) => {
        callbacks.onEvent?.(event);
        if (event.event === "data") {
          const data = event.data as { kind?: unknown; run_id?: unknown };
          if (data.kind === "seo.receipt" && typeof data.run_id === "string") {
            runId = data.run_id;
          }
        }
        if (event.event === "error") {
          streamError = parseStreamError(event.data);
        }
      },
    }),
  );
  if (response.error) {
    throw new Error(response.error.message);
  }
  if (streamError) {
    throw streamError;
  }
  return { runId };
}

export async function disconnectBing(
  connectionId: string,
  organizationId?: string | null,
): Promise<void> {
  await aidreamPost(
    "/api/bing-integrations/disconnect",
    { connection_id: connectionId, organization_id: organizationId ?? null },
    "Unable to disconnect Bing Webmaster.",
  );
}
