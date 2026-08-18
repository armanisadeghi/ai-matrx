// features/education/memory/mandates.ts
//
// Mandate keys for the Memory Tools AI lanes (VISION §11 — Mnemonics,
// Analogies & Associations). These are MANDATE KEYS, not agent ids: each key
// resolves LIVE (system default → org binding → user binding) to whatever
// agent the DATABASE currently binds — agent identity never lives in code.
// Swap the agent at /agents/mandates; no code change, no deploy. See
// features/agents/mandates/FEATURE.md.

export const EDU_MEMORY_MANDATES = {
  /**
   * source_content, title, focus → a `memory_aid` envelope:
   * { __kind, title, strategy_note, mnemonics[], analogies[], memory_palace }.
   * Grounded strictly in the supplied material. Powers /education/memory + the
   * `memory_aid` converter target.
   */
  memoryAid: "education.memory_generate",
  /**
   * front, back, topic → a single `memory_hint` envelope:
   * { __kind, technique, aid, explanation }. Cheap/fast — the proactive,
   * opt-in per-card memory affordance in the flashcards StudyDeck.
   */
  memoryHint: "education.memory_hint",
} as const;
