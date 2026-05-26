"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { aiModelService } from "@/features/ai-models/service";
import ProviderSyncDashboard from "@/features/ai-models/components/ProviderSyncDashboard";
import type { AiModel, AiProvider } from "@/features/ai-models/types";

function ProviderSyncContent() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);

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
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
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
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        }
      >
        <ProviderSyncContent />
      </Suspense>
    </div>
  );
}
