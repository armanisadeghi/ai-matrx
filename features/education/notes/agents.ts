// features/education/notes/agents.ts
//
// Agent ids owned by Smart Notes (P4). Only the notes-generation agent authored
// for the converter's `notes` target lives here; every other converter target
// references its own feature's agent ids.

export const NOTES_AGENTS = {
  /**
   * source_content, title, focus →
   *   { title, notes_markdown, key_terms[] (term, definition), trust }
   * Grounded study-NOTES generator (comprehensive, organized — not a summary).
   * Authored 2026-07-10 (P4 Smart Notes) on the same gemini-flash model + the
   * same TrustEnvelope contract as the summary/deck/mindmap converter agents so
   * a note generated from an upload cites the passages it came from.
   */
  studyNotes: "f23562ce-d4e3-4591-b14d-9ed0736a7d9e",
} as const;

export type NotesAgentKey = keyof typeof NOTES_AGENTS;
