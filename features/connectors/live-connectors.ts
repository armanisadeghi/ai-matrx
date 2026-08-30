import { mcpConnectionRouteFor } from "@/features/agent-connections/mcp-connection-route";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import { getFaviconUrl } from "@/features/tool-call-visualization/renderers/search/parseSearch";
import { connectorsFor, getConnector } from "./registry";
import type { ConnectorDefinition } from "./types";

const FIRST_PARTY_IDS = new Set(["google-workspace", "gmail"]);
const LIVE_SERVER_STATUSES = new Set(["active", "beta", "community"]);

const SIMPLE_ICON_SLUG_BY_PROVIDER_NAME: Record<string, string> = {
  Airtable: "airtable",
  Asana: "asana",
  "Atlassian (Jira & Confluence)": "atlassian",
  Box: "box",
  Calendly: "calendly",
  ClickUp: "clickup",
  Cloudflare: "cloudflare",
  Datadog: "datadog",
  Dropbox: "dropbox",
  Figma: "figma",
  "GitBook Published Docs": "gitbook",
  GitHub: "github",
  GitLab: "gitlab",
  "Grafana Cloud MCP": "grafana",
  HubSpot: "hubspot",
  Intercom: "intercom",
  Linear: "linear",
  "Meta Ads": "meta",
  Miro: "miro",
  Mixpanel: "mixpanel",
  Neon: "neon",
  "New Relic": "newrelic",
  Notion: "notion",
  PayPal: "paypal",
  Plane: "plane",
  PlanetScale: "planetscale",
  PostHog: "posthog",
  Sentry: "sentry",
  "Shopify Global Catalog": "shopify",
  Slack: "slack",
  Square: "square",
  Stripe: "stripe",
  Supabase: "supabase",
  Todoist: "todoist",
  Vercel: "vercel",
  Webflow: "webflow",
  Wix: "wix",
  "WordPress.com": "wordpress",
  "Zoho CRM Data Insights": "zoho",
};

function providerArtworkUrls(entry: McpCatalogEntry): string[] {
  const urls: Array<string | null> = [];

  if (entry.websiteUrl) {
    try {
      urls.push(`${new URL(entry.websiteUrl).origin}/favicon.ico`);
    } catch {
      // An invalid website URL must not suppress otherwise valid artwork.
    }
  }

  const simpleIconSlug = SIMPLE_ICON_SLUG_BY_PROVIDER_NAME[entry.name];
  if (simpleIconSlug) {
    urls.push(`https://cdn.simpleicons.org/${simpleIconSlug}`);
  }

  urls.push(entry.iconUrl?.trim() || null);
  urls.push(entry.websiteUrl ? getFaviconUrl(entry.websiteUrl, 128) : null);

  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

/**
 * A chat integration must be usable from the web app now. Connected remote
 * servers remain visible even when their original setup needed extra config;
 * disconnected entries enter only when this surface can start their real
 * OAuth/no-auth/GitHub connection flow directly.
 */
export function isLiveChatMcpConnector(entry: McpCatalogEntry): boolean {
  if (FIRST_PARTY_IDS.has(entry.slug)) return false;
  if (!LIVE_SERVER_STATUSES.has(entry.serverStatus)) return false;
  if (entry.connectionStatus === "connected") return true;
  if (!entry.endpointUrl || entry.transport === "stdio") return false;

  const route = mcpConnectionRouteFor(entry);
  return route === "github" || route === "oauth" || route === "none";
}

function definitionFromMcp(entry: McpCatalogEntry): ConnectorDefinition {
  const known = getConnector(entry.slug);
  if (known) return known;

  const artworkUrls = providerArtworkUrls(entry);

  return {
    id: entry.slug,
    name: entry.name,
    blurb:
      entry.description?.trim() ||
      `Connect ${entry.name} so agents can use it in conversations`,
    iconUrl: artworkUrls[0] ?? null,
    fallbackIconUrls: artworkUrls.slice(1),
    brandColor: entry.color,
    surfaces: ["strip", "directory"],
    manageHref: `/user-settings/integrations?provider=${encodeURIComponent(entry.slug)}`,
  };
}

/** One catalogue for both the three-chip rotation and the full window. */
export function buildLiveConnectorDefinitions(
  catalog: McpCatalogEntry[],
): ConnectorDefinition[] {
  const definitions = [...connectorsFor("strip")];
  const seen = new Set(definitions.map((connector) => connector.id));

  for (const entry of catalog) {
    if (!isLiveChatMcpConnector(entry) || seen.has(entry.slug)) continue;
    definitions.push(definitionFromMcp(entry));
    seen.add(entry.slug);
  }

  return definitions;
}

export function connectorActionLabel(
  connectorId: string,
  entry: McpCatalogEntry | undefined,
  connected: boolean,
): "Connect" | "Configure" | "Manage" {
  if (connected) return "Manage";
  if (connectorId === "google-workspace" || connectorId === "gmail") {
    return "Connect";
  }
  if (!entry) return "Connect";
  return mcpConnectionRouteFor(entry) === "configure" ? "Configure" : "Connect";
}
