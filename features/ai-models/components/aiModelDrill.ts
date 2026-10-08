import type { MatrxDataTableLocalDrillConfig } from "@ai-matrx/design-system/data-table";

/**
 * LEVELS of the model catalog. A maker (Anthropic, OpenAI) is read by what it charges and how
 * much context it gives, then by who hosts it and what it accepts; a host asks which makers it
 * serves; an input or output kind asks the same of the models that take or return it. A model
 * with no price is counted ("N unknown"), never averaged in as free.
 */
export const AI_MODEL_DRILL: MatrxDataTableLocalDrillConfig = {
  local: true,
  countLabel: "Models",
  dimensions: ["maker", "hosted_by", "input_kinds", "output_kinds", "is_premium", "is_deprecated", "is_primary"],
  measures: ["count", "avg_input_price", "avg_output_price", "avg_context_window", "max_context_window"],
  extraMeasures: [
    { key: "avg_input_price", label: "Input price (avg)", additive: false, op: "avg", of: "input_price", nulls: "count" },
    { key: "avg_output_price", label: "Output price (avg)", additive: false, op: "avg", of: "output_price", nulls: "count" },
    { key: "avg_cached_input_price", label: "Cached input price (avg)", additive: false, op: "avg", of: "cached_input_price", nulls: "count" },
  ],
  levels: {
    maker: {
      breakouts: ["hosted_by", "input_kinds", "output_kinds", "is_premium", "is_deprecated"],
      attributes: [],
      show: ["count", "avg_input_price", "avg_output_price", "avg_context_window", "max_context_window"],
    },
    hosted_by: {
      breakouts: ["maker", "input_kinds", "is_premium", "is_deprecated"],
      attributes: [],
      show: ["count", "avg_input_price", "avg_output_price", "avg_context_window"],
    },
    input_kinds: {
      breakouts: ["maker", "output_kinds", "hosted_by", "is_premium"],
      attributes: [],
      show: ["count", "avg_input_price", "avg_context_window", "max_context_window"],
    },
    output_kinds: {
      breakouts: ["maker", "input_kinds", "hosted_by", "is_premium"],
      attributes: [],
      show: ["count", "avg_output_price", "avg_context_window"],
    },
    is_premium: {
      breakouts: ["maker", "hosted_by", "is_deprecated"],
      attributes: [],
      show: ["count", "avg_input_price", "avg_output_price", "avg_context_window"],
    },
    is_deprecated: {
      breakouts: ["maker", "hosted_by", "is_premium"],
      attributes: [],
      show: ["count", "avg_context_window"],
    },
  },
};
