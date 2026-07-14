// features/education/memory/agents.ts
//
// Live agent ids for the Memory Tools (VISION §11 — Mnemonics, Analogies &
// Associations). Both authored + tuned in-system on gemini-3.5-flash and
// live-verified (agent_run) on 2026-07-13. These permanent ids track the latest
// published version — the prompt/rubric can keep improving with no code change.

export const EDU_MEMORY_AGENTS = {
  /**
   * source_content, title, focus → a `memory_aid` envelope:
   * { __kind, title, strategy_note, mnemonics[], analogies[], memory_palace }.
   * Grounded strictly in the supplied material. Powers the /education/memory tool
   * + the `memory_aid` converter target.
   */
  memoryAid: "826aaa26-baaf-4e87-b5a3-2e4bba37f053",
  /**
   * front, back, topic → a single `memory_hint` envelope:
   * { __kind, technique, aid, explanation }. Cheap/fast — powers the proactive,
   * opt-in per-card memory affordance in the flashcards StudyDeck.
   */
  memoryHint: "4c5dd04a-4b22-43cd-bd8b-781a4d6dedb5",
} as const;
