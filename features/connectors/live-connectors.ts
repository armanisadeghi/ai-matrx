import { mcpConnectionRouteFor } from "@/features/agent-connections/mcp-connection-route";
import type { McpCatalogEntry } from "@ai-matrx/chat/agents/types/mcp.types";
import { getFaviconUrl } from "@ai-matrx/chat/tool-call-visualization/renderers/search/parseSearch";
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

/**
 * The artwork chain for a catalog provider, best first. Square, legible icons
 * lead: the provider's Simple Icons glyph, then Google's 128px site icon for
 * the host and for its registrable domain (a docs subdomain often has none).
 * The catalog's own `icon_url` follows — many are wide wordmarks that shrink
 * to nothing in a square — and the site's raw `/favicon.ico` comes last, since
 * it is usually a blurry 16px image. `ConnectorMark` skips any image that
 * fails or loads too small to read, and ends at a monogram, so every provider
 * always has a mark.
 */
export function providerArtworkUrls(
  entry: Pick<McpCatalogEntry, "name" | "websiteUrl" | "iconUrl">,
): string[] {
  const urls: Array<string | null> = [];

  const simpleIconSlug = SIMPLE_ICON_SLUG_BY_PROVIDER_NAME[entry.name];
  if (simpleIconSlug) {
    urls.push(`https://cdn.simpleicons.org/${simpleIconSlug}`);
  }

  let origin: string | null = null;
  if (entry.websiteUrl) {
    try {
      const url = new URL(entry.websiteUrl);
      origin = url.origin;
      urls.push(getFaviconUrl(url.origin, 128));
      const labels = url.hostname.split(".");
      if (labels.length > 2) {
        urls.push(getFaviconUrl(`https://${labels.slice(-2).join(".")}`, 128));
      }
    } catch {
      // An invalid website URL must not suppress otherwise valid artwork.
    }
  }

  urls.push(entry.iconUrl?.trim() || null);
  if (origin) urls.push(`${origin}/favicon.ico`);

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
  if (!entry.connectionReady) return false;
  if (!entry.endpointUrl || entry.transport === "stdio") return false;

  const route = mcpConnectionRouteFor(entry);
  return route === "github" || route === "oauth" || route === "none";
}

export function connectorDefinitionFromMcp(entry: McpCatalogEntry): ConnectorDefinition {
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
    definitions.push(connectorDefinitionFromMcp(entry));
    seen.add(entry.slug);
  }

  return definitions;
}

export function connectorActionLabel(
  connectorId: string,
  entry: McpCatalogEntry | undefined,
  connected: boolean,
  needsReauth = false,
): "Connect" | "Configure" | "Manage" | "Reconnect" {
  if (connected) return "Manage";
  // A connection the user must restore says so; "Connect" would read as if
  // nothing had ever been set up.
  if (needsReauth) return "Reconnect";
  if (connectorId === "google-workspace" || connectorId === "gmail") {
    return "Connect";
  }
  if (!entry) return "Connect";
  return mcpConnectionRouteFor(entry) === "configure" ? "Configure" : "Connect";
}
