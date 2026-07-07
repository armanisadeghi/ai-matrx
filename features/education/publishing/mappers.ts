// features/education/publishing/mappers.ts
//
// DB row → the shared render/authoring shapes. Sections/related are stored as
// JSONB in the exact EduSection[] vocabulary, so mapping is a typed cast, never
// a transform — keeping the "one content schema, ever" invariant.

import type { EduSection, LearnDoc } from "../types";
import type { LearnDocRecord, LearnDocRow } from "./types";

export function mapRowToLearnDoc(row: LearnDocRow): LearnDocRecord {
  const related = (row.related ?? {}) as LearnDoc["related"];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    subject: row.subject ?? undefined,
    letter: row.letter,
    // "Updated" display date: author-controlled content date, else the row's
    // updated_at fallback (never blank).
    updated: row.content_updated_at ?? row.updated_at.slice(0, 10),
    keywords: row.keywords ?? [],
    sections: (row.sections ?? []) as EduSection[],
    related,
    status: row.visibility === "public" ? "published" : "draft",
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}
