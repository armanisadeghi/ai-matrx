// features/education/memory/types.ts
//
// Memory Tools (VISION §11) — education-side persistence glue ONLY. A
// generated memory aid is a `study_media` row with `media_kind='memory_aid'`;
// its structured content rides the existing `ir_envelope` jsonb column.
//
// THE SHAPE CONTRACT LIVES IN THE KIND REGISTRY, NOT HERE. `memory_aid` and
// `memory_hint` are registered kinds — types + coercers are implemented ONCE
// in `@/features/content-ir/kinds/memory-aid` (import from there, never
// re-declare), and rendering goes through the canonical kind components
// (`MemoryAidBlock` / `MemoryHintBlock`) — never a second renderer.

import type { MemoryAidPayload } from "@/features/content-ir/kinds/memory-aid";

/** Persisted memory-aid generation config (rides in study_media.config). */
export interface MemoryGenConfig {
  /** A short user prompt/hint appended to the source brief, if any. */
  focus?: string;
  /** Counts, cached for a glance in the library list. */
  mnemonicCount: number;
  analogyCount: number;
  hasPalace: boolean;
}

/** Counts for the library list + config, derived from a payload. */
export function memoryAidCounts(payload: MemoryAidPayload): MemoryGenConfig {
  return {
    mnemonicCount: payload.mnemonics.length,
    analogyCount: payload.analogies.length,
    hasPalace: payload.memory_palace.applicable,
  };
}
