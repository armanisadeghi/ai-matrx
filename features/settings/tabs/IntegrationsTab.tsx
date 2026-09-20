"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import IntegrationsPage from "@/features/settings/pages/IntegrationsSettingsPage";
import { MicrosoftConnectPanel } from "@/features/microsoft-integration/MicrosoftConnectPanel";
import { StorageConnectionsPanel } from "@/features/storage-connections/StorageConnectionsPanel";

export default function IntegrationsTab() {
  return (
    <div className="space-y-8">
      {/*
        The Microsoft door lives on THIS tab because aidream's OAuth callback
        redirects a person back to `/user-settings/integrations?provider=microsoft`;
        the outcome banner has to be where they land.
      */}
      <Suspense fallback={null}>
        <MicrosoftConnectPanel />
      </Suspense>
      <Suspense fallback={null}>
        <StorageConnectionsPanel />
      </Suspense>
      <IntegrationsTabCatalog />
    </div>
  );
}

function IntegrationsTabCatalog() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <IntegrationsPage />
    </Suspense>
  );
}
