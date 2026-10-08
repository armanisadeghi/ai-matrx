import { z } from "zod";
import type { GoogleConnectionInventory } from "@/features/marketing/google/types";
import { createClient } from "@/utils/supabase/client";
import { resolveServiceBaseUrl } from "@/lib/api/resolve-service-url";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { parseHttpError, getUserMessage } from "@/lib/api/errors";
import { buildMatrxRequestUrl, sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { consumeStream } from "@/lib/api/stream-parser";
import { updateSiteIntegrations } from "@/features/marketing/data/integrations-service";
import { getSite } from "@/features/marketing/data/service";
import type { MarketingSite } from "@/features/marketing/types";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

export const domainProviders = [
  "vercel",
  "cloudflare",
  "name_com",
  "godaddy",
  "namecheap",
] as const;
export const providerLabels = {
  vercel: "Vercel",
  cloudflare: "Cloudflare",
  name_com: "Name.com",
  godaddy: "GoDaddy",
  namecheap: "Namecheap",
};
export const requiredFields = {
  vercel: ["api_token"],
  cloudflare: ["api_token"],
  name_com: ["username", "api_token"],
  godaddy: ["api_key", "api_secret"],
  namecheap: ["api_user", "api_key", "username", "client_ip"],
};
export const sourceSchema = z.object({
  provider: z.string(),
  connection_id: z.string().nullable(),
  resource_ref: z.string(),
  observed_at: z.string(),
  basis: z.enum([
    "dns_zone",
    "host_account",
    "registrar",
    "manual",
    "brand_search",
  ]),
  state: z.enum(["current", "stale"]),
  nameservers: z.array(z.string()),
  dns_records: z.array(
    z.object({ type: z.string(), name: z.string(), value: z.string() }),
  ),
  details_complete: z.boolean(),
});
export const inventorySchema = z.object({
  provider: z.enum(domainProviders),
  domains: z.array(
    z.object({ domain: z.string(), sources: z.array(sourceSchema) }),
  ),
  complete: z.boolean(),
  pages: z.number(),
  observed_at: z.string(),
  warnings: z.array(z.string()),
});
export const connectedSchema = z.object({
  id: z.string(),
  provider: z.enum(domainProviders),
  account_name: z.string(),
  inventory: inventorySchema,
});
export const reportSchema = z.object({
  canonical: z.string(),
  observed_at: z.string(),
  status: z.enum(["pass", "fail", "error", "n_a"]),
  variants: z.array(
    z.object({
      url: z.string(),
      outcome: z.enum(["pass", "fail", "error"]),
      reason: z.string(),
      duplicate: z.boolean().nullable(),
      similarity: z.number().nullable(),
      hops: z.array(
        z.object({
          url: z.string(),
          status: z.number(),
          location: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export const sitemapSchema = z.object({
  request_id: z.string(),
  connection_id: z.string(),
  property: z.string(),
  action: z.enum(["list", "submit", "delete"]),
  account_name: z.string().nullable().optional(),
  observed_at: z.string(),
  state: z.enum([
    "listed",
    "accepted",
    "verified",
    "rejected",
    "unknown",
    "unavailable",
  ]),
  message: z.string().nullable(),
  write_available: z.boolean(),
  write_reason: z.string().nullable(),
  sitemaps: z.array(
    z.object({
      path: z.string(),
      lastSubmitted: z.string().nullable().optional(),
      lastDownloaded: z.string().nullable().optional(),
      isPending: z.boolean().nullable().optional(),
      errors: z.union([z.string(), z.number()]).nullable().optional(),
      warnings: z.union([z.string(), z.number()]).nullable().optional(),
    }),
  ),
});
export const configSchema = z.object({
  connection_ids: z.array(z.string()).default([]),
  selected_domains: z.array(z.string()).default([]),
  manual_domains: z.array(z.string()).default([]),
});
const integrationsSchema = z
  .object({
    marketing: z
      .object({ owned_domains: configSchema.optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
export function domainConfig(site: MarketingSite) {
  return (
    integrationsSchema.parse(site.integrations).marketing?.owned_domains ??
    configSchema.parse({})
  );
}
export async function saveDomainConfig(
  site: MarketingSite,
  config: z.infer<typeof configSchema>,
) {
  const latest = await getSite(site.id);
  if (
    JSON.stringify(domainConfig(latest)) !== JSON.stringify(domainConfig(site))
  ) {
    throw new Error(
      "Domain choices changed while you were editing. Refresh this site.",
    );
  }
  const current = integrationsSchema.parse(latest.integrations);
  const updated = {
    ...current,
    marketing: { ...current.marketing, owned_domains: config },
  };
  return updateSiteIntegrations({
    siteId: site.id,
    expectedVersion: latest.version,
    integrations: z.json().parse(updated),
  });
}
export async function listDomainConnections() {
  const result = await createClient()
    .schema("users")
    .from("integration_connections")
    .select(
      "id,owner_type,owner_user_id,organization_id,provider,account_name,status,metadata,last_verified_at",
    )
    .in("provider", [...domainProviders])
    .is("deleted_at", null);
  if (result.error) throw result.error;
  return result.data;
}
export async function siteConnectionOperation<T>(
  site: Pick<MarketingSite, "id" | "organization_id">,
  path: string,
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
  progress?: (message: string) => void,
): Promise<T> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session?.access_token)
    throw new Error("Sign in to manage site connections.");
  const organizationId = await ensureOrgId(site.organization_id);
  const response = await sendMatrxRequest(
    buildMatrxRequestUrl(
      resolveServiceBaseUrl("aidream"),
      `/seo/sites/${site.id}/${path}`,
    ),
    {
      method: "POST",
      headers: applyOrganizationContextHeader(
        {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        organizationId,
      ),
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw await parseHttpError(response);
  let output: unknown;
  let error: string | null = null;
  await consumeStream(response, {
    onEvent(event) {
      const data = z
        .object({
          kind: z.string().optional(),
          result: z.unknown().optional(),
          message: z.string().optional(),
          error: z.unknown().optional(),
        })
        .passthrough()
        .safeParse(event.data);
      if (!data.success) return;
      if (data.data.message) progress?.(data.data.message);
      if (data.data.kind === "seo.site_connection_completed")
        output = data.data.result;
      if (event.event === "error")
        error = data.data.message ?? "Connection operation failed.";
    },
  });
  if (error) throw new Error(error);
  if (output === undefined)
    throw new Error(
      "The operation did not return a completion receipt. Refresh to check its saved state.",
    );
  return schema.parse(output);
}

export const propertiesSchema = z.object({
  connection_id: z.string(),
  account_name: z.string().nullable(),
  observed_at: z.string(),
  properties: z.array(
    z.object({
      id: z.string(),
      property: z.string(),
      permission_level: z.string().nullable(),
      matches_site: z.boolean(),
    }),
  ),
});

export function connectionErrorMessage(error: unknown): string {
  return (
    getUserMessage(error).trim() ||
    "Connection operation failed. Refresh to check its saved state."
  );
}

/** Keep authorized provider results in the canonical picker, including org connections. */
export function mergeSearchConsoleProperties(
  inventory: GoogleConnectionInventory | undefined,
  result: z.infer<typeof propertiesSchema>,
): GoogleConnectionInventory | undefined {
  if (!inventory) return inventory;
  const account = inventory.connections.find(
    (row) => row.id === result.connection_id,
  );
  if (!account) return inventory;
  const latest = account.metadata.search_console_properties_observed_at;
  if (
    typeof latest === "string" &&
    Date.parse(latest) > Date.parse(result.observed_at)
  )
    return inventory;
  return {
    connections: inventory.connections.map((row) =>
      row.id === result.connection_id
        ? {
            ...row,
            metadata: {
              ...row.metadata,
              search_console_properties_observed_at: result.observed_at,
            },
          }
        : row,
    ),
    resources: [
      ...inventory.resources.filter(
        (row) =>
          row.connection_id !== result.connection_id ||
          row.resource_type !== "search_console_property",
      ),
      ...result.properties.map((row) => ({
        id: row.id,
        connection_id: result.connection_id,
        resource_type: "search_console_property" as const,
        resource_ref: row.property,
        display_name: row.property,
        permission_level: row.permission_level,
        discovered_at: result.observed_at,
        metadata: {},
      })),
    ],
  };
}
