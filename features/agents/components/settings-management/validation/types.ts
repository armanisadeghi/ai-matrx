import type { NormalizedControls } from "@/lib/redux/slices/agent-settings/types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type { ModelConstraint } from "@/features/ai-models/types";

// =============================================================================
// Severity & Category
// =============================================================================

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationCategory =
  | "unrecognized_key"
  | "invalid_value"
  | "range_violation"
  | "cross_field"
  | "type_mismatch"
  | "deprecated_key"
  | "missing_required"
  | "schema"
  // A recognized LLM param that holds a value but the SELECTED model does not
  // declare a control for it. The setting is still shown (never hidden) — this
  // category drives the caution + one-click "clear" repair.
  | "unsupported_by_model";

// =============================================================================
// Validation Result
// =============================================================================

export interface ValidationIssue {
  ruleId: string;
  key: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  message: string;
  value?: unknown;
  suggestion?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  issuesByKey: Record<string, ValidationIssue[]>;
  issuesBySeverity: Record<ValidationSeverity, ValidationIssue[]>;
  hasErrors: boolean;
  hasWarnings: boolean;
  total: number;
}

// =============================================================================
// Resolved Configuration — the single merged object rules inspect
// =============================================================================

export interface ResolvedConfig {
  settings: FeLlmParams;
  modelId: string | null;
  normalizedControls: NormalizedControls | null;
  recognizedKeys: Set<string>;
  constraints: ModelConstraint[] | null;
}

// =============================================================================
// Rule Declaration
// =============================================================================

export interface ValidationRule {
  id: string;
  description: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  /** Which setting keys this rule inspects (empty = inspects all / cross-cutting). */
  inspects: string[];
  /** Pure function: resolved config → zero or more issues. */
  validate: (config: ResolvedConfig) => ValidationIssue[];
}
