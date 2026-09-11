/**
 * providerSyncComparison — assemble the Provider Sync table rows.
 *
 * 🚨 THE CLASSIFICATION IS THE DATABASE'S, NOT OURS.
 * `ai.provider_sync_candidates` decides matched / excluded / before_cutoff /
 * missing for every model a provider's API returned, from
 * `ai.provider.sync_policy` and the live registry. The sync AGENT reads that
 * same view. Re-deriving any of it here — a hardcoded exclusion list, a local
 * name comparison, a client-side date cutoff — forks the two answers apart,
 * which is exactly the defect that made a screen and an agent disagree about
 * what "excluded" means. This module MAPS the view's `status`; it never
 * recomputes it.
 *
 * The one row kind the view cannot produce is `extra_local`: a model that is
 * in our registry for this provider but was NOT in the provider's last
 * snapshot. It is a complement of the view, not a re-derivation of it, and it
 * is computed here from the same provider-model id set the view iterated.
 */

import type {
  AiModel,
  AiModelAliasRow,
  AiOffering,
  ProviderModelEntry,
  ProviderSyncCandidate,
} from "@/features/ai-models/types";
import {
  buildRowPricing,
  PRICING_NOT_APPLICABLE,
  type ProviderSyncRowPricing,
} from "@/features/ai-models/utils/providerSyncPricing";

export type ProviderSyncComparisonStatus =
  | "matched"
  | "missing_local"
  | "before_cutoff"
  | "extra_local"
  | "excluded";

export type ProviderSyncComparison = {
  id: string;
  display_name: string;
  provider_id: string;
  status: ProviderSyncComparisonStatus;
  providerEntry?: ProviderModelEntry;
  localEntry?: AiModel;
  /** Never undefined: an unpriceable row still says which kind of nothing it is. */
  pricing: ProviderSyncRowPricing;
};

export type ProviderSyncSummaryInput = {
  id: string;
  name: string | null;
  provider_key: string | null;
  fetched_at?: string | null;
};

/** Everything the table needs beyond the view rows, fetched once per page. */
export type ProviderSyncRegistry = {
  localModels: AiModel[];
  offerings: AiOffering[];
  aliases: AiModelAliasRow[];
};

/** `ai.provider_sync_candidates.status` → the table's row status. */
function mapViewStatus(status: string | null): ProviderSyncComparisonStatus {
  switch (status) {
    case "matched":
      return "matched";
    case "excluded":
      return "excluded";
    case "before_cutoff":
      return "before_cutoff";
    case "missing":
      return "missing_local";
    default:
      // The view's CASE is total, so this is unreachable unless the view
      // changes underneath us — in which case the row must NOT quietly render
      // as "matched". "Not in DB" is the loud, action-carrying default.
      return "missing_local";
  }
}

export function buildProviderSyncComparisons(
  summary: ProviderSyncSummaryInput,
  candidates: ProviderSyncCandidate[],
  registry: ProviderSyncRegistry,
): ProviderSyncComparison[] {
  const providerCandidates = candidates.filter(
    (c) => c.provider_id === summary.id,
  );

  const localForProvider = registry.localModels.filter(
    (m) => m.provider_id === summary.id,
  );
  const localById = new Map(localForProvider.map((m) => [m.id, m]));

  // Resolve a provider model id to our registry row the same three ways the
  // view's `in_db` does: model name, an offering's provider_model_id, an alias.
  const byName = new Map(localForProvider.map((m) => [m.name, m]));
  const byProviderModelId = new Map<string, AiModel>();
  const offeringsByModelId = new Map<string, AiOffering[]>();
  for (const offering of registry.offerings) {
    const model = localById.get(offering.model_id);
    if (!model) continue;
    const list = offeringsByModelId.get(offering.model_id);
    if (list) list.push(offering);
    else offeringsByModelId.set(offering.model_id, [offering]);
    if (offering.provider_model_id) {
      byProviderModelId.set(offering.provider_model_id, model);
    }
  }
  const byAlias = new Map<string, AiModel>();
  for (const alias of registry.aliases) {
    const model = localById.get(alias.model_id);
    if (model) byAlias.set(alias.alias, model);
  }

  const resolveLocal = (modelId: string): AiModel | undefined =>
    byName.get(modelId) ??
    byProviderModelId.get(modelId) ??
    byAlias.get(modelId);

  const result: ProviderSyncComparison[] = [];
  const seenProviderIds = new Set<string>();

  for (const candidate of providerCandidates) {
    const modelId = candidate.model_id;
    if (!modelId) continue;
    seenProviderIds.add(modelId);

    const local = resolveLocal(modelId);
    const providerEntry = (candidate.provider_entry ?? undefined) as
      | ProviderModelEntry
      | undefined;
    const offerings = local ? (offeringsByModelId.get(local.id) ?? []) : [];

    result.push({
      id: modelId,
      display_name: candidate.display_name ?? modelId,
      provider_id: summary.id,
      status: mapViewStatus(candidate.status),
      providerEntry,
      localEntry: local,
      pricing: local
        ? buildRowPricing(offerings, providerEntry)
        : { ...PRICING_NOT_APPLICABLE },
    });
  }

  for (const model of localForProvider) {
    if (seenProviderIds.has(model.name)) continue;
    const offerings = offeringsByModelId.get(model.id) ?? [];
    if (offerings.some((o) => seenProviderIds.has(o.provider_model_id ?? ""))) {
      continue;
    }
    result.push({
      id: model.id,
      display_name: model.common_name ?? model.name,
      provider_id: summary.id,
      status: "extra_local",
      localEntry: model,
      pricing: buildRowPricing(offerings, null),
    });
  }

  return result;
}

export function countProviderSyncByStatus(
  comparisons: ProviderSyncComparison[],
): Record<ProviderSyncComparisonStatus, number> {
  const counts: Record<ProviderSyncComparisonStatus, number> = {
    matched: 0,
    missing_local: 0,
    before_cutoff: 0,
    extra_local: 0,
    excluded: 0,
  };
  for (const c of comparisons) counts[c.status] += 1;
  return counts;
}
