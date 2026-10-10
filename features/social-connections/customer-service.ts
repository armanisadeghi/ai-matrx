import { buildMatrxRequestUrl, sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { resolveServiceBaseUrl } from "@/lib/api/resolve-service-url";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";

export const CUSTOMER_SOCIAL_PROVIDERS = [
  "linkedin",
  "discord",
  "twitch",
  "snapchat",
  "reddit",
  "bluesky",
  "mastodon",
] as const;
export type CustomerSocialProvider = (typeof CUSTOMER_SOCIAL_PROVIDERS)[number];
export type CustomerConnectionStatus =
  "connected" | "needs_attention" | "disconnected";

export interface SocialProviderConfig {
  provider: CustomerSocialProvider;
  status: "available" | "unavailable";
  scopes: string[];
  reason?: string;
}

export interface CustomerSocialConnection {
  id: string;
  provider: CustomerSocialProvider;
  status: CustomerConnectionStatus;
  accountName: string | null;
  providerSubject: string | null;
  issuer: string | null;
}

export interface SocialIdentity {
  id: string;
  display_name: string;
  username?: string;
  email?: string;
}

export interface SocialResource {
  resource_id: string | null;
  selected: boolean;
  resource_ref: string;
  display_name: string;
  resource_type: string;
}

function isProvider(value: string): value is CustomerSocialProvider {
  return (CUSTOMER_SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is CustomerConnectionStatus {
  return (
    value === "connected" ||
    value === "needs_attention" ||
    value === "disconnected"
  );
}

function issuerFromMetadata(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("issuer" in value) || typeof value.issuer !== "string") return null;
  try {
    const url = new URL(value.issuer);
    return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

function errorMessage(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "detail" in value &&
    typeof value.detail === "string"
  )
    return value.detail;
  if (
    value &&
    typeof value === "object" &&
    "detail" in value &&
    value.detail &&
    typeof value.detail === "object" &&
    "message" in value.detail &&
    typeof value.detail.message === "string"
  )
    return value.detail.message;
  return "Connection request failed. Try again.";
}

async function socialRequest<T>(
  provider: CustomerSocialProvider,
  operation: "config" | "discover" | "read" | "refresh" | "disconnect" | "select",
  organizationId: string,
  body?: Record<string, string>,
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token)
    throw new Error("Sign in to manage social accounts.");
  const response = await sendMatrxRequest(
    buildMatrxRequestUrl(
      resolveServiceBaseUrl("aidream"),
      `/api/social-oauth/${provider}/${operation}`,
    ),
    {
      method: operation === "config" ? "GET" : "POST",
      headers: applyOrganizationContextHeader(
        {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        organizationId,
      ),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    },
  );
  const output: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(output));
  return output as T;
}

export async function loadSocialConfigs(
  organizationId: string,
): Promise<SocialProviderConfig[]> {
  const results = await Promise.all(
    CUSTOMER_SOCIAL_PROVIDERS.map(async (provider): Promise<SocialProviderConfig> => {
      try {
        const config = await socialRequest<unknown>(
          provider,
          "config",
          organizationId,
        );
        if (
          !config ||
          typeof config !== "object" ||
          !("status" in config) ||
          (config.status !== "available" && config.status !== "unavailable")
        )
          throw new Error("Invalid provider configuration.");
        const scopes =
          "scopes" in config && Array.isArray(config.scopes)
            ? config.scopes.filter(
                (scope): scope is string => typeof scope === "string",
              )
            : [];
        return {
          provider,
          status: config.status,
          scopes,
          reason:
            "reason" in config && typeof config.reason === "string"
              ? config.reason
              : undefined,
        };
      } catch (error) {
        return {
          provider,
          status: "unavailable" as const,
          scopes: [],
          reason:
            error instanceof Error
              ? error.message
              : "Configuration could not be loaded.",
        };
      }
    }),
  );
  return results;
}

export async function loadCustomerSocialConnections(): Promise<
  CustomerSocialConnection[]
> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await getClaimsUser(supabase);
  if (error) throw error;
  if (!user) return [];
  const result = await supabase
    .schema("users")
    .from("integration_connections")
    .select("id,provider,status,account_name,provider_subject,metadata")
    .eq("owner_type", "user")
    .eq("owner_user_id", user.id)
    .in("provider", [...CUSTOMER_SOCIAL_PROVIDERS])
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []).flatMap((row) =>
    isProvider(row.provider) && isStatus(row.status)
      ? [
          {
            id: row.id,
            provider: row.provider,
            status: row.status,
            accountName: row.account_name,
            providerSubject: row.provider_subject,
            issuer: issuerFromMetadata(row.metadata),
          },
        ]
      : [],
  );
}

export async function readCustomerSocialAccount(
  provider: CustomerSocialProvider,
  organizationId: string,
  connectionId: string,
  operation: "read" | "discover" = "read",
): Promise<{ subject: SocialIdentity; resources: SocialResource[] }> {
  const output = await socialRequest<unknown>(
    provider,
    operation,
    organizationId,
    { connection_id: connectionId },
  );
  if (
    !output ||
    typeof output !== "object" ||
    !("subject" in output) ||
    !output.subject ||
    typeof output.subject !== "object" ||
    !("id" in output.subject) ||
    typeof output.subject.id !== "string" ||
    !("display_name" in output.subject) ||
    typeof output.subject.display_name !== "string"
  )
    throw new Error("The account check returned an invalid identity.");
  const resources =
    "resources" in output && Array.isArray(output.resources)
      ? output.resources.flatMap((resource) =>
          resource &&
          typeof resource === "object" &&
          "resource_id" in resource &&
          (typeof resource.resource_id === "string" || resource.resource_id === null) &&
          "resource_ref" in resource &&
          typeof resource.resource_ref === "string" &&
          "display_name" in resource &&
          typeof resource.display_name === "string" &&
          "resource_type" in resource &&
          typeof resource.resource_type === "string"
            ? [
                {
                  resource_id: resource.resource_id,
                  selected: "selected" in resource && resource.selected === true,
                  resource_ref: resource.resource_ref,
                  display_name: resource.display_name,
                  resource_type: resource.resource_type,
                },
              ]
            : [],
        )
      : [];
  return {
    subject: {
      id: output.subject.id,
      display_name: output.subject.display_name,
      email: "profile" in output.subject && output.subject.profile && typeof output.subject.profile === "object" && "email" in output.subject.profile && typeof output.subject.profile.email === "string" ? output.subject.profile.email : undefined,
      username:
        "username" in output.subject &&
        typeof output.subject.username === "string"
          ? output.subject.username
          : undefined,
    },
    resources,
  };
}

export function discoverCustomerSocialAccount(
  provider: CustomerSocialProvider,
  organizationId: string,
  connectionId: string,
): Promise<{ subject: SocialIdentity; resources: SocialResource[] }> {
  return readCustomerSocialAccount(provider, organizationId, connectionId, "discover");
}

export function refreshCustomerSocialAccount(
  provider: CustomerSocialProvider,
  organizationId: string,
  connectionId: string,
): Promise<unknown> {
  return socialRequest(provider, "refresh", organizationId, {
    connection_id: connectionId,
  });
}

export function disconnectCustomerSocialAccount(
  provider: CustomerSocialProvider,
  organizationId: string,
  connectionId: string,
): Promise<unknown> {
  return socialRequest(provider, "disconnect", organizationId, {
    connection_id: connectionId,
  });
}

export function socialAuthorizeUrl(
  provider: CustomerSocialProvider,
  organizationId: string,
  issuer?: string,
  handle?: string,
  reconnectConnectionId?: string,
): string {
  const target = new URL(
    `/api/social-oauth/${provider}/start`,
    window.location.origin,
  );
  target.searchParams.set("organization_id", organizationId);
  target.searchParams.set("return_url", "/user-settings/integrations");
  target.searchParams.set("backend_origin", resolveServiceBaseUrl("aidream"));
  if ((provider === "linkedin" || provider === "bluesky") && reconnectConnectionId) target.searchParams.set("connection_id", reconnectConnectionId);
  if (issuer) target.searchParams.set("issuer", issuer);
  if (handle) target.searchParams.set("handle", handle);
  return target.toString();
}

export function selectCustomerSocialAccount(provider: CustomerSocialProvider, organizationId: string, connectionId: string, resource: SocialResource): Promise<unknown> {
  return socialRequest(provider, "select", organizationId, {connection_id: connectionId, resource_type: resource.resource_type, resource_ref: resource.resource_ref});
}
