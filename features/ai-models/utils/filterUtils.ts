import type { AiModel } from '../types';
import type { AiModelFilters } from '../hooks/useTabUrlState';

export function applyFiltersForCount(
    models: AiModel[],
    q: string,
    filters: AiModelFilters,
): number {
    let result = models;

    if (q) {
        const lq = q.toLowerCase();
        result = result.filter(
            (m) =>
                m.id.toLowerCase().includes(lq) ||
                (m.name ?? '').toLowerCase().includes(lq) ||
                (m.common_name ?? '').toLowerCase().includes(lq) ||
                (m.provider ?? '').toLowerCase().includes(lq) ||
                (m.model_class ?? '').toLowerCase().includes(lq),
        );
    }

    if (filters.provider) {
        result = result.filter((m) => m.provider === filters.provider);
    }
    if (filters.is_deprecated !== undefined) {
        result = result.filter((m) => (m.is_deprecated ?? false) === filters.is_deprecated);
    }
    if (filters.is_primary !== undefined) {
        result = result.filter((m) => (m.is_primary ?? false) === filters.is_primary);
    }
    if (filters.is_premium !== undefined) {
        result = result.filter((m) => (m.is_premium ?? false) === filters.is_premium);
    }
    if (filters.model_class) {
        result = result.filter((m) => m.model_class === filters.model_class);
    }
    if (filters.context_window_min !== undefined) {
        result = result.filter((m) => (m.context_window ?? 0) >= filters.context_window_min!);
    }
    if (filters.context_window_max !== undefined) {
        result = result.filter((m) => (m.context_window ?? Infinity) <= filters.context_window_max!);
    }
    if (filters.max_tokens_min !== undefined) {
        result = result.filter((m) => (m.max_tokens ?? 0) >= filters.max_tokens_min!);
    }
    if (filters.max_tokens_max !== undefined) {
        result = result.filter((m) => (m.max_tokens ?? Infinity) <= filters.max_tokens_max!);
    }

    return result.length;
}
