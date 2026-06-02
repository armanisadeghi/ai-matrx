// ─────────────────────────────────────────────────────────────────────────────
// Audit system types — configurable pass/fail rules for AI model data quality
// ─────────────────────────────────────────────────────────────────────────────

import type { AiModel } from "../types";
import {
  parseCapabilities as parseCapabilitiesCanonical,
  toAuditRecord,
} from "../capabilities/parse";

// ── Capability definitions ─────────────────────────────────────────────────

export type CapabilityKey =
  | "text_input"
  | "text_output"
  | "image_input"
  | "image_output"
  | "audio_input"
  | "audio_output"
  | "video_input"
  | "document_input"
  | "code_execution"
  | "function_calling"
  | "streaming"
  | "vision"
  | "web_search"
  | "json_mode"
  | "structured_output"
  | "system_prompt"
  | "multi_turn"
  | "embeddings"
  | "fine_tuning"
  | "batch_api";

export const ALL_CAPABILITY_KEYS: CapabilityKey[] = [
  "text_input",
  "text_output",
  "image_input",
  "image_output",
  "audio_input",
  "audio_output",
  "video_input",
  "document_input",
  "code_execution",
  "function_calling",
  "streaming",
  "vision",
  "web_search",
  "json_mode",
  "structured_output",
  "system_prompt",
  "multi_turn",
  "embeddings",
  "fine_tuning",
  "batch_api",
];

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  text_input: "Text Input",
  text_output: "Text Output",
  image_input: "Image Input",
  image_output: "Image Output",
  audio_input: "Audio Input",
  audio_output: "Audio Output",
  video_input: "Video Input",
  document_input: "Document Input",
  code_execution: "Code Execution",
  function_calling: "Function Calling",
  streaming: "Streaming",
  vision: "Vision",
  web_search: "Web Search",
  json_mode: "JSON Mode",
  structured_output: "Structured Output",
  system_prompt: "System Prompt",
  multi_turn: "Multi-turn",
  embeddings: "Embeddings",
  fine_tuning: "Fine-tuning",
  batch_api: "Batch API",
};

export const CAPABILITY_GROUPS: Record<string, CapabilityKey[]> = {
  "Core I/O": ["text_input", "text_output", "streaming"],
  Media: [
    "image_input",
    "image_output",
    "audio_input",
    "audio_output",
    "video_input",
    "document_input",
    "vision",
  ],
  Features: [
    "function_calling",
    "json_mode",
    "structured_output",
    "system_prompt",
    "multi_turn",
    "code_execution",
    "web_search",
  ],
  Advanced: ["embeddings", "fine_tuning", "batch_api"],
};

// ── Audit rule configuration ──────────────────────────────────────────────

export type AuditCategory =
  | "pricing"
  | "api_class"
  | "capabilities"
  | "configurations"
  | "core_fields";

export interface AuditRuleConfig {
  /** Pricing audit: require at least one valid pricing tier */
  pricing_required: boolean;
  /** Pricing audit: require all tiers to have positive input_price */
  pricing_require_input_price: boolean;
  /** Pricing audit: require all tiers to have positive output_price */
  pricing_require_output_price: boolean;
  /** API class audit: require api_class to be non-empty */
  api_class_required: boolean;
  /** Capabilities audit: minimum number of capabilities that must be set to true */
  capabilities_min_true: number;
  /** Capabilities audit: these specific capabilities must be present (set to true) */
  capabilities_required_keys: CapabilityKey[];
  /** Capabilities audit: require the capabilities object to exist at all */
  capabilities_object_required: boolean;
  /** Core fields: require common_name */
  require_common_name: boolean;
  /** Core fields: require context_window */
  require_context_window: boolean;
  /** Core fields: require max_tokens */
  require_max_tokens: boolean;
  /** Core fields: require provider */
  require_provider: boolean;
  /** Core fields: require model_class */
  require_model_class: boolean;
}

export const DEFAULT_AUDIT_RULES: AuditRuleConfig = {
  pricing_required: true,
  pricing_require_input_price: true,
  pricing_require_output_price: true,
  api_class_required: true,
  capabilities_min_true: 1,
  capabilities_required_keys: ["text_input", "text_output"],
  capabilities_object_required: true,
  require_common_name: true,
  require_context_window: true,
  require_max_tokens: true,
  require_provider: true,
  require_model_class: true,
};

// ── Per-model audit results ────────────────────────────────────────────────

export interface AuditIssue {
  category: AuditCategory;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ModelAuditResult {
  model: AiModel;
  issues: AuditIssue[];
  /** Pass/fail per category */
  categoryPass: Record<AuditCategory, boolean>;
  /** Overall pass = all required categories pass */
  pass: boolean;
}

// ── Normalised capabilities record ────────────────────────────────────────

/** Capabilities stored in DB can be array, object, or null — we normalise to this */
export type CapabilitiesRecord = Partial<Record<CapabilityKey, boolean>>;

/**
 * Audit-facing flat view of model capabilities. As of the May 2026
 * canonical-shape migration this is now a DERIVED projection of
 * `ModelCapabilities` (`features/ai-models/capabilities/types.ts`),
 * computed via `toAuditRecord` after `parseCapabilities` from the
 * canonical module. The signature is preserved so audit consumers
 * (`CapabilitiesAuditTab`, rule evaluation below) keep working
 * unchanged.
 *
 * Hints (api_class, provider) are forwarded so null/empty rows still
 * resolve sanely — without hints, a null row collapses to an all-false
 * record, which historically tripped the `capabilities_min_true` rule
 * for unrelated reasons.
 */
export function parseCapabilities(
  raw: unknown,
  hints: { api_class?: string | null; provider?: string | null } = {},
): CapabilitiesRecord {
  const canonical = parseCapabilitiesCanonical(raw, hints);
  return toAuditRecord(canonical);
}

// ── Audit runner ──────────────────────────────────────────────────────────

export function auditModel(
  model: AiModel,
  rules: AuditRuleConfig,
): ModelAuditResult {
  const issues: AuditIssue[] = [];

  // ── Core fields ────────────────────────────────────────────────────────
  if (rules.require_common_name && !model.common_name?.trim()) {
    issues.push({
      category: "core_fields",
      field: "common_name",
      message: "Missing common name",
      severity: "error",
    });
  }
  if (
    rules.require_context_window &&
    (model.context_window === null || model.context_window === undefined)
  ) {
    issues.push({
      category: "core_fields",
      field: "context_window",
      message: "Missing context window",
      severity: "warning",
    });
  }
  if (
    rules.require_max_tokens &&
    (model.max_tokens === null || model.max_tokens === undefined)
  ) {
    issues.push({
      category: "core_fields",
      field: "max_tokens",
      message: "Missing max tokens",
      severity: "warning",
    });
  }
  if (rules.require_provider && !model.provider?.trim()) {
    issues.push({
      category: "core_fields",
      field: "provider",
      message: "Missing provider",
      severity: "error",
    });
  }
  if (rules.require_model_class && !model.model_class?.trim()) {
    issues.push({
      category: "core_fields",
      field: "model_class",
      message: "Missing model class",
      severity: "error",
    });
  }

  // ── Pricing ────────────────────────────────────────────────────────────
  const pricing = model.pricing;
  if (rules.pricing_required && (!pricing || pricing.length === 0)) {
    issues.push({
      category: "pricing",
      field: "pricing",
      message: "No pricing tiers defined",
      severity: "error",
    });
  } else if (pricing && pricing.length > 0) {
    pricing.forEach((tier, i) => {
      if (
        rules.pricing_require_input_price &&
        (tier.input_price === null ||
          tier.input_price === undefined ||
          tier.input_price < 0)
      ) {
        issues.push({
          category: "pricing",
          field: `pricing[${i}].input_price`,
          message: `Tier ${i + 1}: invalid input price`,
          severity: "error",
        });
      }
      if (
        rules.pricing_require_output_price &&
        (tier.output_price === null ||
          tier.output_price === undefined ||
          tier.output_price < 0)
      ) {
        issues.push({
          category: "pricing",
          field: `pricing[${i}].output_price`,
          message: `Tier ${i + 1}: invalid output price`,
          severity: "error",
        });
      }
    });
  }

  // ── API class ──────────────────────────────────────────────────────────
  if (rules.api_class_required && !model.api_class?.trim()) {
    issues.push({
      category: "api_class",
      field: "api_class",
      message: "Missing api_class",
      severity: "error",
    });
  }

  // ── Capabilities ───────────────────────────────────────────────────────
  const caps = parseCapabilities(model.capabilities, {
    api_class: model.api_class,
    provider: model.provider,
  });
  if (rules.capabilities_object_required && !model.capabilities) {
    issues.push({
      category: "capabilities",
      field: "capabilities",
      message: "No capabilities object defined",
      severity: "error",
    });
  } else {
    const trueCount = Object.values(caps).filter(Boolean).length;
    if (
      rules.capabilities_min_true > 0 &&
      trueCount < rules.capabilities_min_true
    ) {
      issues.push({
        category: "capabilities",
        field: "capabilities",
        message: `Only ${trueCount} capabilities set (minimum ${rules.capabilities_min_true} required)`,
        severity: "error",
      });
    }
    for (const key of rules.capabilities_required_keys) {
      if (!caps[key]) {
        issues.push({
          category: "capabilities",
          field: `capabilities.${key}`,
          message: `Required capability "${CAPABILITY_LABELS[key]}" is not set`,
          severity: "error",
        });
      }
    }
  }

  // ── Category pass/fail ─────────────────────────────────────────────────
  const categoryPass: Record<AuditCategory, boolean> = {
    pricing: !issues.some(
      (i) => i.category === "pricing" && i.severity === "error",
    ),
    api_class: !issues.some(
      (i) => i.category === "api_class" && i.severity === "error",
    ),
    capabilities: !issues.some(
      (i) => i.category === "capabilities" && i.severity === "error",
    ),
    configurations: true, // placeholder — no rules yet
    core_fields: !issues.some(
      (i) => i.category === "core_fields" && i.severity === "error",
    ),
  };

  return {
    model,
    issues,
    categoryPass,
    pass: Object.values(categoryPass).every(Boolean),
  };
}

export function runAudit(
  models: AiModel[],
  rules: AuditRuleConfig,
): ModelAuditResult[] {
  return models.map((m) => auditModel(m, rules));
}
