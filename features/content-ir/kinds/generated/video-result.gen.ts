/**
 * GENERATED — do not edit. Source of truth: content_ir.kind_definition
 * row "video_result" (schema version 4), emitted by pydantic in
 * aidream and registered in the live Shape registry.
 *
 * Regenerate:  pnpm shape:types video_result
 * Drift check: pnpm check:kind-types
 *
 * This is the COMPLETE-instance type (envelope.root.value at
 * status === "complete"). Mid-stream values are partial — streaming
 * components keep their defensive readers.
 */

export interface VideoResult {
  url: string;
  tags?: string[];
  title: string;
  __kind?: "video_result";
  source: string;
  channel?: string | null;
  favicon?: string | null;
  snippet?: string | null;
  age_text?: string | null;
  platform?: string | null;
  position: number;
  thumbnail?: string | null;
  published_at?: string | null;
  duration_seconds?: number | null;
  preview_clip_url?: string | null;
}
