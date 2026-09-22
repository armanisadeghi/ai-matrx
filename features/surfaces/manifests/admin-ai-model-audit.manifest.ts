/**
 * Surface manifest — AI Model Data Audit (matrx-admin/ai-models/audit).
 *
 * The audit exposes read-only agent context while its existing admin controls
 * still edit model records. It receives the loaded model registry and its
 * deterministic, in-browser audit results; it never carries endpoints, vendor
 * credentials, or offering pricing.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_AI_MODEL_AUDIT_SURFACE_NAME = "matrx-admin/ai-models/audit";

const groups: SurfaceValueGroup[] = [
  {
    key: "audit_data",
    label: "Audit data",
    sortOrder: 100,
    description:
      "The loaded model records and deterministic audit findings currently being inspected.",
  },
  {
    key: "audit_state",
    label: "Audit state",
    sortOrder: 200,
    description:
      "The audit rules and UI state that determine the displayed audit cut.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "models",
    label: "Models",
    description:
      "Every loaded AI model record in the audit source set, including deprecated models before the active exclusion is applied. Empty while the first read is pending.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 30000,
    autoContext: false,
    group: "audit_data",
    sortOrder: 100,
  },
  {
    name: "audit_results",
    label: "Audit results",
    description:
      "One deterministic result per model in the active audit source set: model ID, overall pass state, category pass states, and findings. Model fields remain in models so they are not duplicated here.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 24000,
    autoContext: false,
    group: "audit_data",
    sortOrder: 110,
  },
  {
    name: "audit_summary",
    label: "Audit summary",
    description:
      "Current totals for loaded models, audited models, and failing models. Always present, including during the initial load.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 80,
    group: "audit_data",
    sortOrder: 120,
  },
  {
    name: "active_category",
    label: "Active category",
    description:
      "The audit tab currently open: overview, core fields, capabilities, configurations, or audit rules.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    group: "audit_state",
    sortOrder: 200,
  },
  {
    name: "exclude_deprecated",
    label: "Exclude deprecated",
    description:
      "Whether deprecated models are excluded from the active audit source set.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "audit_state",
    sortOrder: 210,
  },
  {
    name: "audit_rules",
    label: "Audit rules",
    description:
      "The in-memory rule configuration used to derive the displayed audit results.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 500,
    group: "audit_state",
    sortOrder: 220,
  },
  {
    name: "audit_loading",
    label: "Loading audit data",
    description:
      "True while the audit source models are being read or refreshed.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "audit_state",
    sortOrder: 230,
  },
  {
    name: "audit_error",
    label: "Audit load error",
    description:
      "The current source-load failure message, if the audit read failed. Absent when the source is healthy.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "audit_state",
    sortOrder: 240,
  },
];

export const adminAiModelAuditManifest: SurfaceManifest = {
  surfaceName: ADMIN_AI_MODEL_AUDIT_SURFACE_NAME,
  label: "AI Model Data Audit",
  readiness: "partial",
  readinessNote:
    "The audit scope is emitted at run time with every loaded model, deterministic result, rule, and active view state. The surface has no fixed AI worker or write targets; model edits remain the audit's own explicit admin controls.",
  urlPattern: "/administration/ai/ai-models/audit",
  intro: `<surface_intro>
This is the super-admin AI Model Data Audit. The page compares loaded model records against the current deterministic audit rules so an administrator can find missing core fields and capability coverage.

Read audit_summary first for the scope of the current result. models is the source record set; audit_results carries only each model ID, pass state, category states, and findings, so use the two together rather than treating a finding as a duplicate model record. active_category, exclude_deprecated, and audit_rules explain the visible cut and its evaluation.

This surface never supplies endpoint URLs, vendor identities, credentials, secret references, or offering pricing. The audit has no agent write targets: any registry change remains an explicit admin action in the interface.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createAdminAiModelAuditScope(values: {
  models: Record<string, unknown>[];
  audit_results: Array<{
    model_id: string;
    pass: boolean;
    category_pass: Record<string, boolean>;
    issues: Array<{
      category: string;
      field: string;
      severity: string;
      message: string;
    }>;
  }>;
  audit_summary: {
    loaded_model_count: number;
    audited_model_count: number;
    failing_model_count: number;
  };
  active_category: string;
  exclude_deprecated: boolean;
  audit_rules: Record<string, unknown>;
  audit_loading: boolean;
  audit_error?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
