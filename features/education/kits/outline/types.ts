// features/education/kits/outline/types.ts
//
// The kit OUTLINE — the kit's own clean, sectioned document of what its
// Sources teach (living-kit plan, decisions 2–4). Rows live in
// `education.study_structured_section` (one ordered set per kit, written by the
// server workflow `education_kit_outline`); every generated card / question
// made against an outline carries `metadata.outline_section_id` so coverage is
// counted by section id, never by a title a person may rename.

/** The one label every surface shows for the outline. */
export const OUTLINE_LABEL = "Outline";

/** The metadata key a generated item carries to say which section it covers. */
export const OUTLINE_SECTION_KEY = "outline_section_id";

/** The metadata key that groups the items one generation run added (Undo). */
export const BATCH_KEY = "batch_id";

/** One key fact of a section, with the source segments it was drawn from. */
export interface OutlineFact {
  statement: string;
  chunkIds: string[];
}

/** One section of a kit outline, as generation and coverage read it. */
export interface OutlineSection {
  id: string;
  position: number;
  title: string;
  summary: string;
  body: string;
  facts: OutlineFact[];
  /** Source segment ids the section cites (`### Chunk <id>` markers). */
  chunkIds: string[];
}
