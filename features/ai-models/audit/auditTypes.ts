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

// NOTE: model-level pricing was removed — pricing lives on `ai.offering` now
// (managed in the Offerings page + validated server-side by
// `validate_model_pricing`). There is no model-pricing audit category.
export type AuditCategory =
  | "capabilities"
  | "configurations"
  | "core_fields";

export interface AuditRuleConfig {
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
  /** Core fields: require a maker (the provider_id FK) */
  require_provider: boolean;
}

export const DEFAULT_AUDIT_RULES: AuditRuleConfig = {
  capabilities_min_true: 1,
  capabilities_required_keys: ["text_input", "text_output"],
  capabilities_object_required: true,
  require_common_name: true,
  require_context_window: true,
  require_max_tokens: true,
  require_provider: true,
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
 */
export function parseCapabilities(
  raw: unknown,
  context?: { modelId?: string; modelName?: string },
): CapabilitiesRecord {
  return toAuditRecord(parseCapabilitiesCanonical(raw, context));
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
  if (rules.require_provider && !model.provider_id) {
    issues.push({
      category: "core_fields",
      field: "provider",
      message: "Missing maker (provider_id FK)",
      severity: "error",
    });
  }
  // ── Capabilities ───────────────────────────────────────────────────────
  const caps = parseCapabilities(model.capabilities, {
    modelId: model.id,
    modelName: model.name ?? undefined,
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
