"use client";

// Lab preview of the shared integrations directory with fixture data: the
// viewer's own accounts, one an organization shares, and the open catalog.
// No sign-in, so the design can be judged on its own.

import { useState } from "react";
import { IntegrationDirectory } from "@/features/connectors/IntegrationDirectory";
import {
  DEFAULT_DIRECTORY_FILTERS,
  savedAccountSummary,
  type DirectoryFilters,
  type IntegrationDirectoryItem,
} from "@/features/connectors/integration-directory";
import { getConnector } from "@/features/connectors/registry";
import { providerArtworkUrls } from "@/features/connectors/live-connectors";

function item(
  id: string,
  name: string,
  description: string,
  vendor: string,
  category: string,
  website: string | null,
  extra: Partial<IntegrationDirectoryItem> = {},
): IntegrationDirectoryItem {
  // The real catalog chain, from a real website — the same artwork the live
  // directory resolves for a provider with no stored icon.
  const urls = website
    ? providerArtworkUrls({ name, websiteUrl: website, iconUrl: null })
    : [];
  return {
    id,
    name,
    description,
    vendor,
    category,
    keywords: "",
    artwork: {
      id,
      name,
      blurb: description,
      surfaces: ["directory"],
      iconUrl: id === "microsoft" ? "/icons/brands/microsoft.svg" : (urls[0] ?? null),
      fallbackIconUrls: urls.slice(1),
      logo: id === "google" ? getConnector("google-workspace")?.logo : undefined,
    },
    featured: false,
    comingSoon: false,
    ...savedAccountSummary([], false, false),
    ...extra,
  };
}

const ITEMS: IntegrationDirectoryItem[] = [
  item("google", "Google Workspace", "Connect Gmail, Drive, Calendar and the Google products you use.", "Google", "productivity", null, { featured: true, sharedBy: ["AI Matrx"] }),
  item("microsoft", "Microsoft 365", "Read your Outlook mail, calendar, OneDrive, Teams and SharePoint.", "Microsoft", "productivity", null, {
    featured: true,
    ...savedAccountSummary([{ identity: "arman@titaniumsuccess.com", status: "connected" }], false, false),
  }),
  item("github", "GitHub", "Connect repositories, pull requests, issues and your code workspaces.", "GitHub", "developer", "https://github.com", {
    featured: true,
    ...savedAccountSummary([{ identity: "@armanisadeghi", status: "needs_reauth" }], false, false),
  }),
  item("slack", "Slack", "Search channels, read threads and post updates from your agents.", "Slack · Agent tools", "communication", "https://slack.com", { featured: true }),
  item("notion", "Notion", "Read and write pages and databases in your workspace.", "Notion · Agent tools", "productivity", "https://notion.so", { featured: true }),
  item("dropbox", "Dropbox files", "Browse your files and folders and import them into Matrx Files.", "Dropbox", "storage", "https://www.dropbox.com", { featured: true }),
  item("linear", "Linear", "Create and update issues, projects and cycles.", "Linear · Agent tools", "developer", "https://linear.app", { featured: true }),
  item("box", "Box files", "Browse your files and folders and import them into Matrx Files.", "Box", "storage", "https://box.com"),
  item("hubspot", "HubSpot", "Work with contacts, deals and companies in your CRM.", "HubSpot · Agent tools", "crm", "https://hubspot.com"),
  item("stripe", "Stripe", "Look up customers, payments and subscriptions.", "Stripe · Agent tools", "finance", "https://stripe.com"),
  item("asana", "Asana", "Track tasks and projects across your teams.", "Asana · Agent tools", "productivity", "https://asana.com"),
  item("granola", "Granola", "Read your meeting notes and transcripts.", "Granola · Agent tools", "productivity", "https://www.granola.ai"),
  item("attio-docs", "Attio Docs", "Search Attio's developer documentation.", "Attio · Agent tools", "developer", "https://docs.attio.com/"),
  item("mercury", "Mercury", "Read balances and transactions from your bank.", "Mercury · Agent tools", "finance", "https://mercury.com"),
  item("vercel", "Vercel", "Deploy projects and read build logs.", "Vercel · Agent tools", "developer", "https://vercel.com"),
  item("airtable", "Airtable", "Read and update bases, tables and records.", "Airtable · Agent tools", "data", "https://airtable.com", { comingSoon: true, available: false, status: "Coming soon" }),
];

export function LabConnectorsDirectory() {
  const [filters, setFilters] = useState<DirectoryFilters>(DEFAULT_DIRECTORY_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="h-dvh overflow-y-auto bg-textured">
      <IntegrationDirectory
        items={ITEMS}
        filters={filters}
        onFiltersChange={setFilters}
        selectedId={selected}
        onSelect={setSelected}
        renderDetail={(entry) => <p className="text-sm">Detail for {entry.name}</p>}
        loading={false}
        errors={null}
        incomplete={false}
        refreshing={false}
        onRefresh={() => undefined}
      />
    </div>
  );
}
