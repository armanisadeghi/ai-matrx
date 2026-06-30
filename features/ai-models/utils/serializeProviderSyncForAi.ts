import type { AgentPayloadInput } from "@/components/agent-copy/buildAgentPayload";
import type {
  ProviderSyncComparison,
  ProviderSyncComparisonStatus,
  ProviderSyncSummaryInput,
} from "@/features/ai-models/utils/providerSyncComparison";

export const PROVIDER_SYNC_AI_LOCATION =
  "AI Matrx Admin — AI Models Provider Sync";

export type ProviderSyncStatusFilter = ProviderSyncComparisonStatus | "all";

function summarizeComparison(c: ProviderSyncComparison): string {
  const lines = [`Model: ${c.display_name} (${c.id})`, `Status: ${c.status}`];
  if (c.providerEntry?.created_at) {
    lines.push(`Released: ${c.providerEntry.created_at}`);
  }
  if (c.localEntry?.common_name) {
    lines.push(`DB name: ${c.localEntry.common_name}`);
  }
  return lines.join("\n");
}

function leanComparison(c: ProviderSyncComparison) {
  return {
    id: c.id,
    display_name: c.display_name,
    status: c.status,
    provider: c.providerEntry ?? null,
    local: c.localEntry
      ? {
          id: c.localEntry.id,
          name: c.localEntry.name,
          common_name: c.localEntry.common_name,
          model_class: c.localEntry.model_class,
          api_class: c.localEntry.api_class,
          is_primary: c.localEntry.is_primary,
          is_deprecated: c.localEntry.is_deprecated,
        }
      : null,
  };
}

function filterComparisons(
  comparisons: ProviderSyncComparison[],
  statusFilter: ProviderSyncStatusFilter,
): ProviderSyncComparison[] {
  if (statusFilter === "all") return comparisons;
  return comparisons.filter((c) => c.status === statusFilter);
}

export function buildProviderSyncRowPayload(
  comparison: ProviderSyncComparison,
  providerName: string | null,
): AgentPayloadInput {
  return {
    kind: "provider-sync-model",
    location: PROVIDER_SYNC_AI_LOCATION,
    description: `Provider model row: ${comparison.display_name}`,
    attributes: {
      model_id: comparison.id,
      status: comparison.status,
      provider: providerName ?? "unknown",
    },
    summary: summarizeComparison(comparison),
    data: leanComparison(comparison),
  };
}

export function buildProviderSyncProviderPayload(
  summary: ProviderSyncSummaryInput,
  comparisons: ProviderSyncComparison[],
  statusFilter: ProviderSyncStatusFilter,
): AgentPayloadInput {
  const filtered = filterComparisons(comparisons, statusFilter);
  const counts = {
    matched: filtered.filter((c) => c.status === "matched").length,
    missing_local: filtered.filter((c) => c.status === "missing_local").length,
    extra_local: filtered.filter((c) => c.status === "extra_local").length,
    excluded: filtered.filter((c) => c.status === "excluded").length,
  };

  return {
    kind: "provider-sync-provider",
    location: PROVIDER_SYNC_AI_LOCATION,
    description: `Provider sync export for ${summary.name ?? summary.id}`,
    attributes: {
      provider: summary.name ?? summary.id,
      provider_key: summary.provider_key ?? undefined,
      status_filter: statusFilter,
      model_count: filtered.length,
    },
    context: {
      fetched_at: summary.fetched_at ?? undefined,
    },
    summary: [
      `Provider: ${summary.name ?? summary.id}`,
      `Filter: ${statusFilter}`,
      `Models: ${filtered.length}`,
      `Matched: ${counts.matched}, Not in DB: ${counts.missing_local}, Extra: ${counts.extra_local}, Excluded: ${counts.excluded}`,
    ].join("\n"),
    data: {
      provider: {
        id: summary.id,
        name: summary.name,
        provider_key: summary.provider_key,
        fetched_at: summary.fetched_at ?? null,
      },
      status_filter: statusFilter,
      counts,
      models: filtered.map(leanComparison),
    },
  };
}

export type ProviderSyncPageExport = {
  summary: ProviderSyncSummaryInput;
  comparisons: ProviderSyncComparison[];
};

export function buildProviderSyncPagePayload(
  exports: ProviderSyncPageExport[],
): AgentPayloadInput {
  const providers = exports.map(({ summary, comparisons }) => {
    const counts = {
      matched: comparisons.filter((c) => c.status === "matched").length,
      missing_local: comparisons.filter((c) => c.status === "missing_local")
        .length,
      extra_local: comparisons.filter((c) => c.status === "extra_local").length,
      excluded: comparisons.filter((c) => c.status === "excluded").length,
    };
    return {
      provider: {
        id: summary.id,
        name: summary.name,
        provider_key: summary.provider_key,
        fetched_at: summary.fetched_at ?? null,
      },
      counts,
      models: comparisons.map(leanComparison),
    };
  });

  const totalModels = providers.reduce((n, p) => n + p.models.length, 0);

  return {
    kind: "provider-sync-dashboard",
    location: PROVIDER_SYNC_AI_LOCATION,
    description: "Full provider sync dashboard export",
    attributes: {
      provider_count: providers.length,
      model_count: totalModels,
    },
    summary: providers
      .map(
        (p) =>
          `${p.provider.name ?? p.provider.id}: ${p.models.length} models (${p.counts.matched} matched, ${p.counts.missing_local} not in DB, ${p.counts.extra_local} extra, ${p.counts.excluded} excluded)`,
      )
      .join("\n"),
    data: { providers },
  };
}
