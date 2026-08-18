// features/education/notes/mandates.ts
//
// Mandate key owned by Smart Notes (P4). This is a MANDATE KEY, not an agent
// id: it resolves LIVE (system default → org binding → user binding) to
// whatever agent the DATABASE currently binds — agent identity never lives in
// code. Swap the agent at /agents/mandates; no code change, no deploy. See
// features/agents/mandates/FEATURE.md.

export const NOTES_MANDATES = {
  /**
   * source_content, title, focus →
   *   { title, notes_markdown, key_terms[] (term, definition), trust }
   * Grounded study-NOTES generator (comprehensive, organized — not a summary);
   * same TrustEnvelope contract as the summary/deck/mindmap converter lanes.
   */
  studyNotes: "education.notes_generate",
} as const;

export type NotesMandateKey = keyof typeof NOTES_MANDATES;
