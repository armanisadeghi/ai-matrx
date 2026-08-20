/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "news_result" (schema version 4), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types news_result
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

export interface NewsResult {
  url: string;
  tags?: string[];
  title: string;
  __kind?: "news_result";
  author?: string | null;
  source: string;
  snippet?: string | null;
  age_text?: string | null;
  position: number;
  site_name: string;
  thumbnail?: string | null;
  is_breaking?: boolean | null;
  source_logo?: string | null;
  published_at?: string | null;
  extra_snippets?: string[];
}
