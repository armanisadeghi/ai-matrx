// Context Management — Type Definitions
// Source of truth: Supabase schema for ctx_context_items, ctx_context_item_values, ctx_templates, ctx_context_access_log

import type { Database } from "@/types/database.types";

export type ContextItemStatus =
  | "idea"
  | "stub"
  | "gathering"
  | "partial"
  | "needs_review"
  | "ai_enriched"
  | "in_revision"
  | "pending_approval"
  | "active"
  | "provisional"
  | "stale"
  | "needs_update"
  | "superseded"
  | "archived"
  | "deprecated";

export type ContextValueType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "document"
  | "reference";
export type ContextFetchHint =
  | "always"
  | "on_demand"
  | "batch_related"
  | "lazy"
  | "never";
export type ContextSensitivity =
  | "public"
  | "internal"
  | "restricted"
  | "privileged";
export type ContextSourceType =
  | "manual"
  | "ai_generated"
  | "ai_enriched"
  | "imported"
  | "scraped"
  | "system";
export type ContextScopeLevel =
  | "user"
  | "organization"
  | "scope"
  | "project"
  | "task";

export type ContextScope = {
  type: ContextScopeLevel;
  id: string;
  name: string;
};

// DB Row is canonical — ContextItem = full ctx_context_items row + optional join fields
export type ContextItem =
  Database["public"]["Tables"]["ctx_context_items"]["Row"] & {
    // From current ctx_context_item_values row (when manifest merge runs)
    current_text_value?: string | null;
    value_last_updated?: string | null;
    char_count?: number | null;
    data_point_count?: number | null;
    has_nested_objects?: boolean;
    json_keys?: string[];
  };

// Manifest is the same shape; kept as alias for semantic clarity
export type ContextItemManifest = ContextItem;

export type ContextItemValue =
  Database["public"]["Tables"]["ctx_context_item_values"]["Row"];

export type ContextTemplate =
  Database["public"]["Tables"]["ctx_templates"]["Row"];

// Template context item (items defined within a template)
export type ContextTemplateItem =
  Database["public"]["Tables"]["ctx_template_context_items"]["Row"];

export type ContextAccessLogEntry =
  Database["public"]["Tables"]["ctx_context_access_log"]["Row"];

export type ContextAccessSummary = {
  context_item_id: string;
  total_fetches: number;
  last_fetched: string | null;
  useful_rate: number | null;
};

// Form types
export type ContextItemFormData = {
  display_name: string;
  key: string;
  description: string;
  category: string | null;
  tags: string[];
  status: ContextItemStatus;
  status_note: string | null;
  value_type: ContextValueType;
  fetch_hint: ContextFetchHint;
  sensitivity: ContextSensitivity;
  source_type: ContextSourceType;
  scope_type_id: string;
  review_interval_days: number | null;
  last_verified_at: string | null;
  depends_on: string[];
};

export type ContextValueFormData = {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_json: Record<string, unknown> | unknown[] | null;
  value_document_url: string | null;
  value_document_size_bytes: number | null;
  value_reference_id: string | null;
  value_reference_type: string | null;
  change_summary: string | null;
};

// Filter/sort types for item list
export type ContextItemFilters = {
  search: string;
  statuses: ContextItemStatus[];
  categories: string[];
  fetchHints: ContextFetchHint[];
  sensitivities: ContextSensitivity[];
  hasValue: "yes" | "no" | "either";
};

export type ContextItemSort = {
  field:
    | "display_name"
    | "status"
    | "updated_at"
    | "next_review_at"
    | "char_count";
  direction: "asc" | "desc";
};

export type ContextItemView = "cards" | "table" | "kanban";

// Dashboard stat types
export type ContextDashboardStats = {
  totalItems: number;
  activeVerified: number;
  needsAttention: number;
  emptyStub: number;
};

export type ContextCategoryHealth = {
  category: string;
  total: number;
  active: number;
  partial: number;
  stub: number;
  needsAttention: number;
};

// Template industry grouping
export type ContextIndustryGroup = {
  industry_category: string;
  template_name: string;
  template_label: string;
  item_count: number;
  required_count: number;
  example_items: string[];
};
