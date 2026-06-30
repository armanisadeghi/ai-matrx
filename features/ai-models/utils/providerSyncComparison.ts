import { isExcludedProviderModel } from "@/features/ai-models/constants/excluded-provider-models";
import type {
  AiModel,
  AiProvider,
  ProviderModelEntry,
} from "@/features/ai-models/types";

export type ProviderSyncComparisonStatus =
  "matched" | "missing_local" | "extra_local" | "excluded";

export type ProviderSyncComparison = {
  id: string;
  display_name: string;
  provider_id: string;
  status: ProviderSyncComparisonStatus;
  providerEntry?: ProviderModelEntry;
  localEntry?: AiModel;
};

export type ProviderSyncSummaryInput = {
  id: string;
  name: string | null;
  provider_key: string | null;
  fetched_at?: string | null;
};

export function buildProviderSyncComparisons(
  summary: ProviderSyncSummaryInput,
  provider: AiProvider | undefined,
  localModels: AiModel[],
): ProviderSyncComparison[] {
  const cache = provider?.provider_models_cache;
  if (!cache) return [];

  const providerIds = new Set(cache.models.map((m) => m.id));
  const localForProvider = localModels.filter(
    (m) =>
      m.model_provider === summary.id ||
      (summary.name &&
        m.provider?.toLowerCase() === summary.name.toLowerCase()),
  );

  const result: ProviderSyncComparison[] = [];

  for (const pm of cache.models) {
    const local = localForProvider.find((lm) => lm.name === pm.id);
    let status: ProviderSyncComparisonStatus;
    if (local) {
      status = "matched";
    } else if (isExcludedProviderModel(summary.provider_key, pm.id)) {
      status = "excluded";
    } else {
      status = "missing_local";
    }

    result.push({
      id: pm.id,
      display_name: pm.display_name ?? pm.id,
      provider_id: summary.id,
      status,
      providerEntry: pm,
      localEntry: local,
    });
  }

  for (const lm of localForProvider) {
    if (!providerIds.has(lm.name)) {
      result.push({
        id: lm.id,
        display_name: lm.common_name ?? lm.name,
        provider_id: summary.id,
        status: "extra_local",
        localEntry: lm,
      });
    }
  }

  return result;
}

export function countProviderSyncByStatus(
  comparisons: ProviderSyncComparison[],
): Record<ProviderSyncComparisonStatus, number> {
  return {
    matched: comparisons.filter((c) => c.status === "matched").length,
    missing_local: comparisons.filter((c) => c.status === "missing_local")
      .length,
    extra_local: comparisons.filter((c) => c.status === "extra_local").length,
    excluded: comparisons.filter((c) => c.status === "excluded").length,
  };
}
