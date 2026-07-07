/**
 * Compiled bootstrap of `content_ir.kind_surface` entries — the pre-warm
 * FALLBACK floor for the surface registry, mirroring how system-kinds.ts
 * mirrors `kind_definition`: available synchronously at import so a completed
 * region can converge to its canonical kind before any network fetch. Once
 * the warm merge lands, DB rows override these (DB is the source of truth;
 * SHAPE_SYSTEM.md R2 — `kind_surface` is the ONE enumerable input-surface
 * list, never a second detector).
 *
 * One entry per (surfaceType, token). `parserStrategy` is a NAME — the
 * implementation lives in surfaces/ (see surfaces/xml-finalize.ts). An entry
 * naming a strategy this build does not implement fails LOUDLY at
 * convergence time and leaves legacy rendering untouched, never silently.
 *
 * This file is metadata only: no IO, no strategy imports — the registry
 * stays consultable from anywhere without dragging parser code along.
 */

/** Mirrors the `content_ir.kind_surface.surface_type` vocabulary. */
export type KindSurfaceType =
  | "xml_tag"
  | "fence_lang"
  | "json_root_key"
  | "tool_name";

export interface KindSurfaceEntry {
  surfaceType: KindSurfaceType;
  /** Detector token: tag name for xml_tag, language for fence_lang, … (lowercase). */
  token: string;
  /** Canonical kind slug the surface converges to at region finalize. */
  kind: string;
  /** Named parser strategy (implemented per runtime — R2). */
  parserStrategy: string;
  /** Whether the surface streams (per-tag skeleton until COMPLETE). */
  streaming: boolean;
}

export const SYSTEM_SURFACE_ENTRIES: KindSurfaceEntry[] = [
  // THE KEYSTONE (Stage 1): <flashcards> XML converges to the canonical
  // flashcard_set kind at region finalize — XML and __kind JSON render
  // through the SAME kind pipeline. Mirrors the live kind_surface row.
  {
    surfaceType: "xml_tag",
    token: "flashcards",
    kind: "flashcard_set",
    parserStrategy: "flashcards_legacy_text",
    streaming: true,
  },
];
