import { parseCapabilities } from "../capabilities/parse";
import type { AiModel } from "../types";
import type { AiModelFilters } from "../hooks/useTabUrlState";

export type AiModelComparisonRow = Pick<
  AiModel,
  | "id"
  | "name"
  | "common_name"
  | "maker"
  | "capabilities"
  | "is_deprecated"
  | "is_primary"
  | "is_premium"
  | "context_window"
  | "max_tokens"
  | "preferred_pricing"
>;

export function applyAiModelFilters<T extends AiModelComparisonRow>(
  models: T[],
  q: string,
  filters: AiModelFilters,
): T[] {
  let result = models;

  if (q) {
    const lq = q.toLowerCase();
    result = result.filter((model) => {
      const capabilities = parseCapabilities(model.capabilities, {
        modelId: model.id,
        modelName: model.name,
      });
      return [
        model.id,
        model.name ?? "",
        model.common_name ?? "",
        model.maker ?? "",
        ...capabilities.input,
        ...capabilities.output,
      ].some((value) => value.toLowerCase().includes(lq));
    });
  }

  if (filters.provider) {
    result = result.filter((model) => model.maker === filters.provider);
  }
  if (filters.input_capability) {
    const inputCapability = filters.input_capability;
    result = result.filter((model) =>
      parseCapabilities(model.capabilities, {
        modelId: model.id,
        modelName: model.name,
      }).input.includes(inputCapability),
    );
  }
  if (filters.output_capability) {
    const outputCapability = filters.output_capability;
    result = result.filter((model) =>
      parseCapabilities(model.capabilities, {
        modelId: model.id,
        modelName: model.name,
      }).output.includes(outputCapability),
    );
  }
  if (filters.is_deprecated !== undefined) {
    result = result.filter(
      (model) =>
        (model.is_deprecated ?? false) === filters.is_deprecated,
    );
  }
  if (filters.is_primary !== undefined) {
    result = result.filter(
      (model) => (model.is_primary ?? false) === filters.is_primary,
    );
  }
  if (filters.is_premium !== undefined) {
    result = result.filter(
      (model) => (model.is_premium ?? false) === filters.is_premium,
    );
  }
  if (filters.context_window_min !== undefined) {
    const contextWindowMin = filters.context_window_min;
    result = result.filter(
      (model) => (model.context_window ?? 0) >= contextWindowMin,
    );
  }
  if (filters.context_window_max !== undefined) {
    const contextWindowMax = filters.context_window_max;
    result = result.filter(
      (model) => (model.context_window ?? Infinity) <= contextWindowMax,
    );
  }
  if (filters.max_tokens_min !== undefined) {
    const maxTokensMin = filters.max_tokens_min;
    result = result.filter(
      (model) => (model.max_tokens ?? 0) >= maxTokensMin,
    );
  }
  if (filters.max_tokens_max !== undefined) {
    const maxTokensMax = filters.max_tokens_max;
    result = result.filter(
      (model) => (model.max_tokens ?? Infinity) <= maxTokensMax,
    );
  }

  return result;
}

export function sortAiModels<T extends AiModelComparisonRow>(
  models: T[],
  sort: string,
  dir: "asc" | "desc",
): T[] {
  const field = sort === "provider" ? "maker" : sort;
  if (field === "input_price" || field === "output_price") {
    return [...models].sort((a, b) => {
      const aPrice = a.preferred_pricing?.[field];
      const bPrice = b.preferred_pricing?.[field];
      if (aPrice === null || aPrice === undefined) {
        return bPrice === null || bPrice === undefined ? 0 : 1;
      }
      if (bPrice === null || bPrice === undefined) return -1;
      return dir === "asc" ? aPrice - bPrice : bPrice - aPrice;
    });
  }
  const valueFor = (model: T): string | number => {
    if (field in model) {
      const value = model[field as keyof T];
      return typeof value === "number" ? value : String(value ?? "");
    }
    return "";
  };
  return [...models].sort((a, b) => {
    const aValue = valueFor(a);
    const bValue = valueFor(b);
    const comparison =
      typeof aValue === "number" && typeof bValue === "number"
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), undefined, {
            numeric: true,
          });
    return dir === "asc" ? comparison : -comparison;
  });
}

export function applyFiltersForCount(
    models: AiModel[],
    q: string,
    filters: AiModelFilters,
): number {
  return applyAiModelFilters(models, q, filters).length;
}
