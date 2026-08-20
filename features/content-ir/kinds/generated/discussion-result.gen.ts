/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "discussion_result" (schema version 2), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types discussion_result
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

export interface DiscussionResult {
  url: string;
  score?: string | null;
  title: string;
  __kind?: "discussion_result";
  source: string;
  favicon?: string | null;
  snippet?: string | null;
  age_text?: string | null;
  position: number;
  forum_name?: string | null;
  top_answer?: string | null;
  answer_count?: number | null;
  published_at?: string | null;
  /**
   * Thread question body, HTML stripped.
   */
  question_text?: string | null;
}
