"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { Skeleton } from "@ai-matrx/design-system";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { aiModelService } from "@/features/ai-models/service";
import ProviderSyncDashboard from "@/features/ai-models/components/ProviderSyncDashboard";
import type { AiModel, AiProvider } from "@/features/ai-models/types";

function ProviderSyncContent() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  // The skeleton is for the FIRST load only. A refresh (after a write, a
  // policy change, a Sync Now) must never unmount the dashboard: unmounting it
  // re-runs its mount effect, which asks the parent to reload again — the
  // infinite remount loop the 2026-09-11 review caught.
  const [loadedOnce, setLoadedOnce] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedModels, fetchedProviders] = await Promise.all([
        aiModelService.fetchAll(),
        aiModelService.fetchProviders(),
      ]);
      setModels(fetchedModels);
      setProviders(fetchedProviders);
    } catch (err) {
      console.error("[provider-sync page] load error", err);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !loadedOnce) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <ProviderSyncDashboard
      localModels={models}
      providers={providers}
      onModelsChanged={loadData}
    />
  );
}

export default function ProviderSyncPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader
              centered={false}
              message="Loading model provider sync…"
            />
          </div>
        }
      >
        <ProviderSyncContent />
      </Suspense>
    </div>
  );
}
