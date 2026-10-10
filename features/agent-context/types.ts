// Context Management — Type Definitions
// Field, value and scope shapes come from @ai-matrx/records/scopes; this file keeps the item
// lifecycle words and the template/access-log rows of the `context` schema.

import type { Database } from "@/types/database.types";
import type { ContextPolicy, ContextSensitivity } from "@ai-matrx/records/scopes";

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

// A field's kind, context policy and sensitivity are the record store's words: `ContextFieldKind`,
// `ContextPolicy` (include / on_request / exclude) and `ContextSensitivity` (public / internal /
// confidential / restricted) from `@ai-matrx/records/scopes`. Nothing here re-declares them.

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

export type ContextTemplate = Database["context"]["Tables"]["templates"]["Row"];

// Template context item (items defined within a template)
export type ContextTemplateItem =
  Database["context"]["Tables"]["template_context_items"]["Row"];

export type ContextAccessLogEntry =
  Database["context"]["Tables"]["context_access_log"]["Row"];

export type ContextAccessSummary = {
  context_item_id: string;
  total_fetches: number;
  last_fetched: string | null;
  useful_rate: number | null;
};

// Filter/sort types for item list
export type ContextItemFilters = {
  search: string;
  statuses: ContextItemStatus[];
  categories: string[];
  contextPolicies: ContextPolicy[];
  sensitivities: ContextSensitivity[];
  hasValue: "yes" | "no" | "either";
};

export type ContextItemSort = {
  field:
    | "label"
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
