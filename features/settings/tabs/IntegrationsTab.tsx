"use client";

import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import IntegrationsPage from "@/features/settings/pages/IntegrationsSettingsPage";
import type { ViewFilter } from "@/features/settings/pages/IntegrationsSettingsPage";
import { MicrosoftConnectPanel } from "@/features/microsoft-integration/MicrosoftConnectPanel";
import type { MicrosoftConnection } from "@/features/microsoft-integration/types";
import { StorageConnectionsPanel } from "@/features/storage-connections/StorageConnectionsPanel";
import type { StorageConnection } from "@/features/storage-connections/types";
import { IntegrationSearch } from "./IntegrationSearch";

export default function IntegrationsTab() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [microsoftAccounts, setMicrosoftAccounts] = useState<
    MicrosoftConnection[] | "error" | null
  >(null);
  const [storageAccounts, setStorageAccounts] = useState<
    StorageConnection[] | "error" | null
  >(null);
  const [googleProductFocus, setGoogleProductFocus] = useState<{
    productKey: string;
    request: number;
  } | null>(null);
  const updateSearch = (query: string) => {
    setSearch(query);
    setActiveCategory("all");
    setViewFilter("all");
  };
  return (
    <div className="-mx-2 space-y-6 sm:mx-0 sm:space-y-8">
      <IntegrationSearch
        query={search}
        onQueryChange={updateSearch}
        microsoftAccounts={microsoftAccounts}
        storageAccounts={storageAccounts}
        onGoogleProductSelect={(productKey) =>
          setGoogleProductFocus((current) => ({
            productKey,
            request: (current?.request ?? 0) + 1,
          }))
        }
      />
      {/*
        The Microsoft door lives on THIS tab because aidream's OAuth callback
        redirects a person back to `/user-settings/integrations?provider=microsoft`;
        the outcome banner has to be where they land.
      */}
      <Suspense fallback={null}>
        <MicrosoftConnectPanel onConnectionsChange={setMicrosoftAccounts} />
      </Suspense>
      <Suspense fallback={null}>
        <StorageConnectionsPanel onConnectionsChange={setStorageAccounts} />
      </Suspense>
      <IntegrationsTabCatalog
        search={search}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        viewFilter={viewFilter}
        onViewFilterChange={setViewFilter}
        googleProductFocus={googleProductFocus}
      />
    </div>
  );
}

function IntegrationsTabCatalog({
  search,
  activeCategory,
  onCategoryChange,
  viewFilter,
  onViewFilterChange,
  googleProductFocus,
}: {
  search: string;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  viewFilter: ViewFilter;
  onViewFilterChange: (filter: ViewFilter) => void;
  googleProductFocus: { productKey: string; request: number } | null;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <IntegrationsPage
        search={search}
        activeCategory={activeCategory}
        onCategoryChange={onCategoryChange}
        viewFilter={viewFilter}
        onViewFilterChange={onViewFilterChange}
        googleProductFocus={googleProductFocus}
      />
    </Suspense>
  );
}
