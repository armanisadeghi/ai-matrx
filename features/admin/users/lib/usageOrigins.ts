import type { AdminUserUsageOriginRow } from "../types";

const num = (v: unknown): number => Number(v) || 0;

/**
 * jsonb → typed for `chat.admin_user_usage_rollup(...).by_origin`.
 *
 * The RPC builds it with jsonb_build_object, so its numbers arrive as JSON
 * numbers — but a numeric aggregate crossing PostgREST can also arrive as a
 * string, and the generated Database type only promises `Json`. Coerce rather
 * than trust, and never hand a consumer an undefined array.
 */
export function normalizeUsageOrigins(value: unknown): AdminUserUsageOriginRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    return {
      origin_class: String(o.origin_class ?? "unknown"),
      requests: num(o.requests),
      total_cost: num(o.total_cost),
      input_tokens: num(o.input_tokens),
      output_tokens: num(o.output_tokens),
      total_tokens: num(o.total_tokens),
    };
  });
}
