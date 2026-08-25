// features/education/convert/mandates.ts
//
// Mandate keys used by the converter's own generators. These are MANDATE KEYS,
// not agent ids: each key resolves LIVE (system default → org binding → user
// binding) to whatever agent the DATABASE currently binds — agent identity
// never lives in code. Swap the agent at /agents/mandates; no code change, no
// deploy. See features/agents/mandates/FEATURE.md.
//
// Feature-owned generators (memory_aid → memory, mind_map → media) reference
// THEIR feature's mandates — only the converter/ingest flow's own lanes live
// here.

import { FC_MANDATES } from "@/features/flashcards/data/mandates";

export const CONVERT_MANDATES = {
  /**
   * source_content, title, focus → { title, summary_markdown, key_points[], trust }
   * — the registered `study_summary` kind (trust is the shared trust_envelope).
   * Grounded study-summary generator (same TrustEnvelope contract as the
   * flashcard/mindmap generators).
   */
  summarize: "education.summarize",
  /**
   * source_content, document_id, count, difficulty → grounded flashcard deck.
   * The converter's former duplicate deck agent collapsed into the canonical
   * flashcards from-source mandate (program decision D-WP2-3) — one lane, one
   * binding, everywhere a deck is generated from source material.
   */
  deckFromSource: FC_MANDATES.generateFromSource,
} as const;

export type ConvertMandateKey = keyof typeof CONVERT_MANDATES;
