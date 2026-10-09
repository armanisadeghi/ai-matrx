// features/education/kits/outline/coverage.ts
//
// Outline coverage (living-kit decision 3, W3): how many cards and questions
// the kit holds for each outline section, counted by `metadata.outline_section_id`
// — never by a title a person may rename. An item made before the outline (or
// pointing at a section that has since vanished) counts as "Not mapped", never
// as a gap. Pure: the reads live in `convert/existingItems.ts`.

import type { OutlineSection } from "./types";

export interface CoverageRow {
  sectionId: string;
  title: string;
  cards: number;
  questions: number;
}

export interface KitCoverage {
  rows: CoverageRow[];
  /** Items with no (or an unknown) section id. */
  unmapped: { cards: number; questions: number };
  /** The largest per-section total — the bars' full width. */
  max: number;
}

/** Count items per section id; ids not in `sectionIds` land in `unmapped`. */
export function countBySection(
  items: readonly { sectionId: string | null }[],
  sectionIds: ReadonlySet<string>,
): { bySection: Map<string, number>; unmapped: number } {
  const bySection = new Map<string, number>();
  let unmapped = 0;
  for (const item of items) {
    if (item.sectionId && sectionIds.has(item.sectionId)) {
      bySection.set(item.sectionId, (bySection.get(item.sectionId) ?? 0) + 1);
    } else unmapped++;
  }
  return { bySection, unmapped };
}

/** One row per section (outline order) plus the "Not mapped" totals. */
export function kitCoverage(
  sections: readonly Pick<OutlineSection, "id" | "title">[],
  cards: readonly { sectionId: string | null }[],
  questions: readonly { sectionId: string | null }[],
): KitCoverage {
  const ids = new Set(sections.map((s) => s.id));
  const c = countBySection(cards, ids);
  const q = countBySection(questions, ids);
  const rows = sections.map((s) => ({
    sectionId: s.id,
    title: s.title,
    cards: c.bySection.get(s.id) ?? 0,
    questions: q.bySection.get(s.id) ?? 0,
  }));
  return {
    rows,
    unmapped: { cards: c.unmapped, questions: q.unmapped },
    max: rows.reduce((m, r) => Math.max(m, r.cards + r.questions), 0),
  };
}

/** Per-section totals of one kind, for `gapSections`. */
export function countsOf(coverage: KitCoverage, kind: "cards" | "questions"): Map<string, number> {
  return new Map(coverage.rows.map((r) => [r.sectionId, r[kind]]));
}
