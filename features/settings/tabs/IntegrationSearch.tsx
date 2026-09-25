"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectMcpCatalog,
  selectMcpCatalogError,
  selectMcpCatalogStatus,
} from "@/features/agents/redux/mcp/mcp.slice";
import { GOOGLE_CONNECTOR_PROVIDER } from "@/features/connectors/provider-config";
import { MICROSOFT_CAMPAIGN_DESCRIPTORS } from "@/features/microsoft-integration/campaigns";
import type { MicrosoftConnection } from "@/features/microsoft-integration/types";
import type { StorageConnection } from "@/features/storage-connections/types";
import { STORAGE_PROVIDER_COPY } from "@/features/storage-connections/StorageConnectionsPanel";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { matchesIntegrationSearch } from "./integration-search-match";

interface SearchResult {
  label: string;
  detail: string;
  target: string;
  text: string;
  productKey?: string;
}

const FIXED_RESULTS: SearchResult[] = [
  {
    label: "Microsoft",
    detail: "Work account · OneDrive, Outlook, Teams, SharePoint",
    target: "integration-microsoft",
    text: "Microsoft work account OneDrive Outlook Teams SharePoint mail calendar",
  },
  ...MICROSOFT_CAMPAIGN_DESCRIPTORS.map((item) => ({
    label: item.label,
    detail: "Microsoft permission",
    target: `ms-campaign-${item.campaign}`,
    text: `Microsoft ${item.label} ${item.grants} ${item.cannot ?? ""}`,
  })),
  ...(["dropbox", "box"] as const).map((provider) => {
    const copy = STORAGE_PROVIDER_COPY[provider];
    return {
      label: copy.name,
      detail: "File connection",
      target: `integration-storage-${provider}`,
      text: `${copy.name} file storage folders import browse ${copy.scope} ${copy.limitation}`,
    };
  }),
  {
    label: "GitHub",
    detail: "Repositories and code workspaces",
    target: "integration-github",
    text: "GitHub repositories code pull requests issues actions",
  },
  {
    label: "Google Workspace",
    detail: "Accounts and permissions",
    target: "integration-google",
    text: `Google Workspace Gmail Drive Calendar Contacts ${GOOGLE_CONNECTOR_PROVIDER.products.map((item) => item.name).join(" ")}`,
  },
  ...GOOGLE_CONNECTOR_PROVIDER.products.map((item) => ({
    label: item.name,
    detail: "Google Workspace permission",
    target: `integration-google-product-${item.key}`,
    text: `Google ${item.name} ${item.promise}`,
    productKey: item.key,
  })),
];

export function IntegrationSearch({
  query,
  onQueryChange,
  microsoftAccounts,
  storageAccounts,
  onGoogleProductSelect,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  microsoftAccounts: readonly MicrosoftConnection[] | "error" | null;
  storageAccounts: readonly StorageConnection[] | "error" | null;
  onGoogleProductSelect: (productKey: string) => void;
}) {
  const catalog = useAppSelector(selectMcpCatalog);
  const catalogError = useAppSelector(selectMcpCatalogError);
  const catalogStatus = useAppSelector(selectMcpCatalogStatus);
  const googleInventory = useGoogleConnectionInventory();
  const [showAll, setShowAll] = useState(false);
  const normalized = query.trim();
  const fixed = normalized
    ? FIXED_RESULTS.filter((item) =>
        matchesIntegrationSearch(normalized, item.text),
      )
    : [];
  const servers = normalized
    ? catalog
        .filter((entry) =>
          matchesIntegrationSearch(
            normalized,
            `${entry.name} ${entry.vendor} ${entry.description} ${entry.category}`,
          ),
        )
        .map((entry) => ({
          label: entry.name,
          detail: `${entry.vendor} · Hosted integration`,
          target: `integration-server-${entry.serverId}`,
          text: "",
        }))
    : [];
  const accounts: SearchResult[] = [
    ...(Array.isArray(microsoftAccounts) ? microsoftAccounts : []).map(
      (account) => ({
        label:
          account.accountEmail ?? account.accountName ?? "Microsoft account",
        detail: "Microsoft account",
        target: `integration-microsoft-account-${account.id}`,
        text: `Microsoft ${account.accountEmail ?? ""} ${account.accountName ?? ""}`,
      }),
    ),
    ...(Array.isArray(storageAccounts) ? storageAccounts : []).map(
      (account) => ({
        label:
          account.accountEmail ??
          account.accountName ??
          `${account.provider} account`,
        detail: `${account.provider === "dropbox" ? "Dropbox" : "Box"} account`,
        target: `integration-storage-account-${account.id}`,
        text: `${account.provider} ${account.accountEmail ?? ""} ${account.accountName ?? ""}`,
      }),
    ),
    ...(googleInventory.data?.connections ?? []).map((account) => ({
      label: account.account_email ?? account.account_name ?? "Google account",
      detail: "Google Workspace account",
      target: `integration-google-account-${account.id}`,
      text: `Google Workspace ${account.account_email ?? ""} ${account.account_name ?? ""}`,
    })),
  ];
  const rank = (label: string) => {
    const name = label.toLowerCase();
    const needle = normalized.toLowerCase();
    return name === needle ? 0 : name.startsWith(needle) ? 1 : 2;
  };
  const results: SearchResult[] = [
    ...fixed,
    ...accounts.filter((account) =>
      matchesIntegrationSearch(normalized, account.text),
    ),
    ...servers,
  ].sort((a, b) => rank(a.label) - rank(b.label));
  const visible = showAll ? results : results.slice(0, 8);
  const stillLoading =
    catalogStatus === "idle" ||
    catalogStatus === "loading" ||
    googleInventory.isLoading ||
    microsoftAccounts === null ||
    storageAccounts === null;
  const incomplete =
    Boolean(catalogError) ||
    googleInventory.isError ||
    microsoftAccounts === "error" ||
    storageAccounts === "error";

  return (
    <section aria-label="Find a connection" className="space-y-2">
      <label
        htmlFor="integration-search"
        className="block text-sm font-medium text-foreground"
      >
        Find a connection
      </label>
      <div role="search" className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="integration-search"
          type="search"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setShowAll(false);
          }}
          placeholder="Search connections and capabilities"
          className="h-11 w-full min-w-0 pl-10 pr-10 text-base [&::-webkit-search-cancel-button]:hidden sm:text-sm"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQueryChange("")}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {normalized ? (
        <div aria-live="polite" className="border-y border-border py-1">
          {results.length ? (
            <>
              <p className="px-1 py-1 text-xs text-muted-foreground">
                {results.length} {results.length === 1 ? "result" : "results"}{" "}
                across connections and capabilities
                {stillLoading
                  ? " · loading more services"
                  : incomplete
                    ? " · some accounts or services unavailable"
                    : ""}
              </p>
              <ul className="divide-y divide-border/50">
                {visible.map((result) => (
                  <li key={result.target}>
                    <a
                      href={`#${result.target}`}
                      onClick={(event) => {
                        if (result.productKey) {
                          event.preventDefault();
                          document.getElementById("integration-google")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                          onGoogleProductSelect(result.productKey);
                          return;
                        }
                        if (document.getElementById(result.target)) return;
                        const fallback = result.target.startsWith("integration-google")
                          ? "integration-google"
                          : result.target.startsWith("integration-microsoft")
                            ? "integration-microsoft"
                            : result.target === "integration-github"
                              ? "integration-connections"
                            : result.target.startsWith("integration-storage")
                              ? "integration-storage"
                              : "integration-catalog";
                        event.preventDefault();
                        document.getElementById(fallback)?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                      className="flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-md px-1.5 py-2 text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere] font-medium text-foreground">
                        {result.label}
                      </span>
                      <span className="min-w-0 text-xs text-muted-foreground sm:text-right">
                        {result.detail}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              {!showAll && results.length > visible.length ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11"
                  onClick={() => setShowAll(true)}
                >
                  Show all {results.length} results
                </Button>
              ) : null}
            </>
          ) : (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              {stillLoading
                ? "Searching connections…"
                : incomplete
                  ? "Some connections could not be searched. Reload the page to try again."
                  : "No connections or capabilities match this search."}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
