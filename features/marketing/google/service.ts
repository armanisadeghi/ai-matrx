import { createClient } from "@/utils/supabase/client";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
  GoogleConnectionInventory,
  GoogleConnectionOwner,
  GoogleOAuthCompleteMessage,
} from "@/features/marketing/google/types";

const CONNECTION_SELECT =
  "id, owner_type, owner_user_id, organization_id, provider, provider_subject, account_email, account_name, scopes, status, last_verified_at, last_error, created_at, updated_at, metadata";
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

function connectionSummary(row: ConnectionRow): GoogleConnectionSummary {
  return {
    ...row,
    owner_type: row.owner_type === "organization" ? "organization" : "user",
    provider: "google",
    status:
      row.status === "needs_attention" || row.status === "revoked"
        ? row.status
        : "connected",
    metadata: recordValue(row.metadata),
  };
}

function connectionResource(row: ResourceRow): GoogleConnectionResource {
  return {
    ...row,
    resource_type:
      row.resource_type === "analytics_property"
        ? "analytics_property"
        : "search_console_property",
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

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return new Error(typeof body.error === "string" ? body.error : fallback);
}

export async function connectGoogle(
  owner: GoogleConnectionOwner,
  returnPath: string,
): Promise<GoogleOAuthCompleteMessage> {
  const popup = window.open(
    "about:blank",
    "ai-matrx-google-oauth",
    "popup,width=560,height=720",
  );
  if (!popup) throw new Error("Allow popups to connect your Google account.");
  popup.document.title = "Connecting Google";
  popup.document.body.textContent = "Preparing Google authorization…";

  try {
    const response = await fetch("/api/marketing/google/oauth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerType: owner.type,
        organizationId:
          owner.type === "organization" ? owner.organizationId : null,
        returnPath,
      }),
    });
    if (!response.ok)
      throw await responseError(response, "Unable to start Google OAuth.");
    const body = (await response.json()) as { authorizationUrl?: unknown };
    if (typeof body.authorizationUrl !== "string") {
      throw new Error("Google authorization URL was not returned.");
    }
    popup.location.href = body.authorizationUrl;

    return await new Promise<GoogleOAuthCompleteMessage>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => finish(new Error("Google authorization timed out.")),
        10 * 60 * 1000,
      );
      const closed = window.setInterval(() => {
        if (popup.closed)
          finish(new Error("Google authorization window was closed."));
      }, 500);
      const onMessage = (event: MessageEvent<unknown>) => {
        if (event.origin !== window.location.origin) return;
        const message = event.data as Partial<GoogleOAuthCompleteMessage>;
        if (message.type !== "marketing_google_oauth_complete") return;
        if (message.ok)
          finish(undefined, message as GoogleOAuthCompleteMessage);
        else finish(new Error(message.error || "Google authorization failed."));
      };
      const finish = (error?: Error, message?: GoogleOAuthCompleteMessage) => {
        window.clearTimeout(timeout);
        window.clearInterval(closed);
        window.removeEventListener("message", onMessage);
        if (!popup.closed) popup.close();
        if (error) reject(error);
        else resolve(message as GoogleOAuthCompleteMessage);
      };
      window.addEventListener("message", onMessage);
    });
  } catch (error) {
    if (!popup.closed) popup.close();
    throw error;
  }
}

export async function disconnectGoogle(connectionId: string): Promise<void> {
  const response = await fetch("/api/marketing/google/oauth/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });
  if (!response.ok)
    throw await responseError(response, "Unable to disconnect Google.");
}
