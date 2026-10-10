import type { McpCatalogEntry } from "@ai-matrx/chat/agents/types/mcp.types";
import { MCP_CATEGORY_META } from "@ai-matrx/chat/agents/types/mcp.types";
import { matchesIntegrationSearch } from "@/features/settings/tabs/integration-search-match";
import { readConnectionStatus } from "./connection-status";
import type { ConnectorDefinition } from "./types";

export type DirectoryView = "discover" | "yours";
export type DirectoryFilter = "all" | "connected" | "available" | "coming_soon";
export interface IntegrationDirectoryItem {
  id: string;
  name: string;
  description: string;
  vendor: string;
  category: string;
  keywords: string;
  artwork: ConnectorDefinition;
  featured: boolean;
  saved: boolean;
  connected: boolean;
  available: boolean;
  comingSoon: boolean;
  status: string;
  attention: boolean;
  accountSummary?: string;
  /**
   * Organizations that share an account of this kind with the viewer. Never
   * makes the item `saved`/`connected` — those describe the viewer's OWN
   * accounts (`connection-ownership.ts`).
   */
  sharedBy?: readonly string[];
  server?: McpCatalogEntry;
}

export interface DirectoryFilters {
  view: DirectoryView;
  query: string;
  category: string;
  status: DirectoryFilter;
  browse: "categories" | "all" | "featured";
}
export const DEFAULT_DIRECTORY_FILTERS: DirectoryFilters = {
  view: "discover",
  query: "",
  category: "all",
  status: "all",
  browse: "categories",
};

export function filterDirectory(
  items: readonly IntegrationDirectoryItem[],
  filters: DirectoryFilters,
) {
  return items
    .filter((item) => {
      if (filters.view === "yours" && !item.saved && !item.sharedBy?.length)
        return false;
      if (filters.category !== "all" && item.category !== filters.category)
        return false;
      if (filters.status === "connected" && !item.connected) return false;
      if (filters.status === "available" && !item.available) return false;
      if (filters.status === "coming_soon" && !item.comingSoon) return false;
      if (
        filters.browse === "featured" &&
        filters.view === "discover" &&
        !item.featured
      )
        return false;
      const category =
        MCP_CATEGORY_META[item.category as keyof typeof MCP_CATEGORY_META]
          ?.label ?? item.category;
      return matchesIntegrationSearch(
        filters.query,
        `${item.name} ${item.description} ${item.vendor} ${category} ${item.keywords} ${item.accountSummary ?? ""}`,
      );
    })
    .sort((a, b) => {
      if (filters.view === "yours" && a.attention !== b.attention)
        return a.attention ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function savedAccountSummary(
  accounts: readonly { identity: string; status: string | null }[],
  loading: boolean,
  failed: boolean,
) {
  const states = accounts.map((account) =>
    account.status === "needs_reauth"
      ? "needs_attention"
      : readConnectionStatus(account.status).status,
  );
  const unknown = states.some((state) => state === null);
  const unavailable = states.includes("unavailable");
  const attention = states.includes("needs_attention");
  const connected = states.includes("connected");
  return {
    saved: accounts.length > 0,
    connected: !loading && !failed && connected,
    attention: !loading && !failed && !unknown && !unavailable && attention,
    available: !loading && !failed && !unknown && !unavailable,
    status: loading
      ? "Checking…"
      : failed || unknown
        ? "Status unavailable"
        : unavailable
          ? "Unavailable"
          : attention
            ? "Needs attention"
            : connected
              ? "Connected"
              : states.includes("revoked")
                ? "Revoked"
                : accounts.length > 0
                  ? "Disconnected"
                  : "Not connected",
    accountSummary: accounts
      .map((account) => account.identity)
      .filter(Boolean)
      .join(", "),
  };
}

/** Provider return URLs open the relevant detail without changing browsing state. */
export function directoryDetailFromParams(
  params: Pick<URLSearchParams, "get">,
): string | null {
  if (params.get("microsoft_status")) return "native:microsoft";
  const provider = params.get("provider");
  if (
    provider === "google" ||
    provider === "google-workspace" ||
    provider === "gmail"
  )
    return "native:google";
  if (provider === "microsoft") return "native:microsoft";
  if (provider === "github") return "native:github";
  if (
    provider === "dropbox" ||
    provider === "box" ||
    provider === "tiktok" ||
    provider === "x"
  )
    return `native:${provider}`;
  return provider ? `provider:${provider}` : null;
}
