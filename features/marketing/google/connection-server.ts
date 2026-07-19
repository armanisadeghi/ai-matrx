import "server-only";

import { createAdminClient } from "@/utils/supabase/adminClient";
import {
  decryptCredential,
  encryptCredential,
} from "@/features/marketing/google/server";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface ResourceInsert {
  connection_id: string;
  resource_type: "search_console_property" | "analytics_property";
  resource_ref: string;
  display_name: string;
  permission_level: string | null;
  metadata: Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function googleJson(
  url: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google API request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
  return objectValue(await response.json());
}

async function discoverSearchConsole(
  accessToken: string,
): Promise<ResourceInsert[]> {
  const data = await googleJson(
    "https://www.googleapis.com/webmasters/v3/sites",
    accessToken,
  );
  const entries = Array.isArray(data.siteEntry) ? data.siteEntry : [];
  return entries.flatMap((entry) => {
    const item = objectValue(entry);
    const siteUrl = stringValue(item.siteUrl);
    if (!siteUrl) return [];
    return [
      {
        connection_id: "",
        resource_type: "search_console_property" as const,
        resource_ref: siteUrl,
        display_name: siteUrl,
        permission_level: stringValue(item.permissionLevel),
        metadata: {},
      },
    ];
  });
}

async function discoverAnalytics(
  accessToken: string,
): Promise<ResourceInsert[]> {
  const data = await googleJson(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    accessToken,
  );
  const accounts = Array.isArray(data.accountSummaries)
    ? data.accountSummaries
    : [];
  return accounts.flatMap((account) => {
    const accountValue = objectValue(account);
    const accountName = stringValue(accountValue.displayName);
    const properties = Array.isArray(accountValue.propertySummaries)
      ? accountValue.propertySummaries
      : [];
    return properties.flatMap((property) => {
      const propertyValue = objectValue(property);
      const resourceRef = stringValue(propertyValue.property);
      if (!resourceRef) return [];
      const propertyName =
        stringValue(propertyValue.displayName) ?? resourceRef;
      return [
        {
          connection_id: "",
          resource_type: "analytics_property" as const,
          resource_ref: resourceRef,
          display_name: accountName
            ? `${propertyName} · ${accountName}`
            : propertyName,
          permission_level: null,
          metadata: {
            account: stringValue(accountValue.account),
            account_name: accountName,
            property_type: stringValue(propertyValue.propertyType),
            parent: stringValue(propertyValue.parent),
          },
        },
      ];
    });
  });
}

export async function exchangeAndStoreGoogleConnection(input: {
  code: string;
  redirectUri: string;
  userId: string;
  ownerType: "user" | "organization";
  organizationId: string | null;
}): Promise<string> {
  // Server runtimes use the private alias. Keep the public variable as a
  // fallback so local/dev deployments only need the existing browser config.
  const clientId =
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured on this deployment.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tokens = (await tokenResponse.json()) as TokenResponse;
  if (!tokenResponse.ok || !tokens.access_token) {
    throw new Error(
      tokens.error_description ||
        tokens.error ||
        "Google token exchange failed.",
    );
  }

  const profile = await googleJson(
    "https://openidconnect.googleapis.com/v1/userinfo",
    tokens.access_token,
  );
  const providerSubject = stringValue(profile.sub);
  if (!providerSubject) {
    throw new Error("Google account identity was not returned.");
  }

  const admin = createAdminClient();
  const connections = admin.schema("users").from("integration_connections");
  let existingQuery = connections
    .select("id, credential_ciphertext, credential_iv, credential_tag")
    .eq("provider", "google")
    .eq("provider_subject", providerSubject)
    .is("deleted_at", null);
  if (input.ownerType === "user") {
    existingQuery = existingQuery.eq("owner_user_id", input.userId);
  } else {
    if (!input.organizationId) {
      throw new Error("The organization could not be resolved.");
    }
    existingQuery = existingQuery.eq("organization_id", input.organizationId);
  }
  const existing = await existingQuery.maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  let refreshToken = tokens.refresh_token;
  if (!refreshToken && existing.data) {
    refreshToken = decryptCredential({
      ciphertext: existing.data.credential_ciphertext,
      iv: existing.data.credential_iv,
      tag: existing.data.credential_tag,
    }).refreshToken;
  }
  if (!refreshToken) {
    throw new Error(
      "Google did not issue offline access. Remove AI Matrx from your Google account permissions, then connect again.",
    );
  }

  const scopes = (tokens.scope || "").split(" ").filter(Boolean);
  const encrypted = encryptCredential({ refreshToken, scopes });
  const discovery = await Promise.allSettled([
    discoverSearchConsole(tokens.access_token),
    discoverAnalytics(tokens.access_token),
  ]);
  const resources = discovery.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  const discoveryErrors = discovery.flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : "Google resource discovery failed.",
        ]
      : [],
  );
  const now = new Date().toISOString();
  const connectionValues = {
    owner_type: input.ownerType,
    owner_user_id: input.ownerType === "user" ? input.userId : null,
    organization_id:
      input.ownerType === "organization" ? input.organizationId : null,
    provider: "google" as const,
    provider_subject: providerSubject,
    account_email: stringValue(profile.email),
    account_name: stringValue(profile.name),
    scopes,
    status: discoveryErrors.length
      ? ("needs_attention" as const)
      : ("connected" as const),
    last_verified_at: now,
    last_error: discoveryErrors.length
      ? discoveryErrors.join(" ").slice(0, 1000)
      : null,
    credential_ciphertext: encrypted.ciphertext,
    credential_iv: encrypted.iv,
    credential_tag: encrypted.tag,
    updated_at: now,
    deleted_at: null,
  };

  let connectionId = existing.data?.id;
  if (connectionId) {
    const updated = await connections
      .update(connectionValues)
      .eq("id", connectionId);
    if (updated.error) throw new Error(updated.error.message);
  } else {
    const inserted = await connections
      .insert(connectionValues)
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    connectionId = inserted.data.id;
  }

  const resourceTable = admin
    .schema("users")
    .from("integration_connection_resources");
  const cleared = await resourceTable
    .update({ deleted_at: now, updated_at: now })
    .eq("connection_id", connectionId)
    .is("deleted_at", null);
  if (cleared.error) throw new Error(cleared.error.message);
  if (resources.length) {
    const insertedResources = await resourceTable.insert(
      resources.map((resource) => ({
        ...resource,
        connection_id: connectionId,
      })),
    );
    if (insertedResources.error) {
      throw new Error(insertedResources.error.message);
    }
  }

  return connectionId;
}
