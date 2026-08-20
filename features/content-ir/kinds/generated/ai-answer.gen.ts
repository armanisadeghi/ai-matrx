/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "ai_answer" (schema version 2), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types ai_answer
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

export interface AiAnswerBlock {
  text?: string | null;
  type: "paragraph" | "heading" | "list";
  items?: string[];
}

export interface AiAnswerReference {
  url: string;
  index?: number | null;
  source_name?: string | null;
}

export interface AiAnswer {
  __kind?: "ai_answer";
  blocks: AiAnswerBlock[];
  source: string;
  references?: AiAnswerReference[];
}
