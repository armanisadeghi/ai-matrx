// features/ai-models/redux/platformDefaultModel.ts
//
// Platform-default model resolution — the ONE place "no model chosen" turns
// into an actual catalog model (D41 item 3).
//
// User preferences (userPreferences.prompts.defaultModel,
// textGeneration.defaultModel, imageGeneration.defaultModel) hold `null` to
// mean "platform default". Consumers resolve the real model at consumption
// time from the AI catalog: `is_primary` on `ai.model_public` marks platform
// defaults. Several models per modality may carry `is_primary`; the resolver
// picks the FIRST primary in the registry's stable active ordering
// (common_name asc) — deterministic, catalog-driven, zero hardcoded ids.
//
// Loud recovery: if the catalog is LOADED but holds no primary for the
// requested modality, the resolver console.warn's ONCE per modality and
// returns null — it never silently picks index 0. An unloaded catalog
// returns null silently (nothing to resolve yet, not a defect).

import { createSelector } from "@reduxjs/toolkit";
import { parseCapabilities } from "@/features/ai-models/capabilities/parse";
import {
  selectActiveModels,
  selectActiveModelsReady,
  type AIModelRecord,
} from "@/features/ai-models/redux/modelRegistrySlice";

/** The modalities a preference field can default on. Extend as fields appear. */
export type DefaultableModality = "text" | "image";

// One scream per modality per session — the selector runs on hot render paths.
const warnedMissingPrimary = new Set<DefaultableModality>();

/**
 * Pure core: first `is_primary` model whose capabilities declare `modality`
 * as an OUTPUT, in the given (already stably ordered) list. Null when the
 * list is empty (catalog not loaded) or no primary exists for the modality —
 * the latter screams once when `catalogReady` says the catalog IS loaded.
 */
export function resolvePlatformDefaultModel(
  models: AIModelRecord[],
  modality: DefaultableModality,
  catalogReady: boolean,
): AIModelRecord | null {
  if (models.length === 0) return null;
  const match = models.find((m) => {
    if (m.is_primary !== true) return false;
    const caps = parseCapabilities(m.capabilities, {
      modelId: m.id,
      modelName: m.name,
    });
    return caps.output.includes(modality);
  });
  if (!match) {
    if (catalogReady && !warnedMissingPrimary.has(modality)) {
      warnedMissingPrimary.add(modality);
      console.warn(
        `[platformDefaultModel] AI catalog is loaded but has NO is_primary model with "${modality}" output — ` +
          "platform-default resolution returns null instead of guessing. " +
          "Mark a primary model in the admin catalog (ai.model_definition.is_primary).",
      );
    }
    return null;
  }
  return match;
}

/** Platform-default TEXT model (or null — see module header). */
export const selectPlatformDefaultTextModel = createSelector(
  [selectActiveModels, selectActiveModelsReady],
  (models, ready): AIModelRecord | null =>
    resolvePlatformDefaultModel(models, "text", ready),
);

/** Platform-default IMAGE model (or null — see module header). */
export const selectPlatformDefaultImageModel = createSelector(
  [selectActiveModels, selectActiveModelsReady],
  (models, ready): AIModelRecord | null =>
    resolvePlatformDefaultModel(models, "image", ready),
);

export const selectPlatformDefaultTextModelId = createSelector(
  [selectPlatformDefaultTextModel],
  (m): string | null => m?.id ?? null,
);

export const selectPlatformDefaultImageModelId = createSelector(
  [selectPlatformDefaultImageModel],
  (m): string | null => m?.id ?? null,
);

/** Display name of the platform-default model for a modality (or null). */
export const selectPlatformDefaultTextModelName = createSelector(
  [selectPlatformDefaultTextModel],
  (m): string | null => m?.common_name ?? m?.name ?? null,
);

export const selectPlatformDefaultImageModelName = createSelector(
  [selectPlatformDefaultImageModel],
  (m): string | null => m?.common_name ?? m?.name ?? null,
);

/**
 * Consumption-time resolution rule for every default-model preference:
 * explicit user choice wins, otherwise the catalog's platform default.
 * Keep all `preference ?? catalog` logic on this helper so the rule can't
 * fork per callsite.
 */
export function resolveDefaultModelId(
  preferredModelId: string | null | undefined,
  platformDefaultId: string | null,
): string | null {
  return preferredModelId ?? platformDefaultId;
}
