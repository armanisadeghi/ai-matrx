// features/education/classes/classTests.ts
//
// Pure rules for the TESTS of a class (a quiz, midterm or final that covers
// one or many units). No table: a test is a scope under the per-org "Test"
// scope type; test → class is the unit's own `part_of` edge marked
// `metadata.kind = "test"` (+ the optional date); test → unit edges carry the
// role `covers`. Studying for a test combines the material of its units.

import type { ContainerLink } from "@ai-matrx/associations/react";
import { CLASS_TEST_COVERS_ROLE, CLASS_TEST_EDGE_KIND } from "./constants";
import { isTestLink, itemKey, metadataOf, type PartEdge } from "./classParts";

/** One test of a class, as the hub shows it. */
export interface ClassTest {
  id: string;
  name: string;
  /** `YYYY-MM-DD`, or null when the test has no date. */
  date: string | null;
  /** The ids of the units this test covers. */
  unitIds: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The edge metadata a test's `part_of` edge carries. */
export function testEdgeMetadata(date: string | null): {
  kind: typeof CLASS_TEST_EDGE_KIND;
  date: string | null;
} {
  return { kind: CLASS_TEST_EDGE_KIND, date: date && ISO_DATE.test(date) ? date : null };
}

/** The class's test links — `part_of` edges marked as tests. */
export function classTestLinks(links: readonly ContainerLink[]): ContainerLink[] {
  return links.filter(isTestLink);
}

/** The date a test's edge carries, or null. */
export function testDateOf(link: ContainerLink): string | null {
  const d = metadataOf(link).date;
  return typeof d === "string" && ISO_DATE.test(d) ? d : null;
}

/**
 * Which units each test covers: `covers` edges from a scope into the class's
 * units. Only units the class still has count (a removed unit drops out).
 */
export function testCoverage(
  edges: readonly PartEdge[],
  testIds: readonly string[],
  unitIds: readonly string[],
): Map<string, string[]> {
  const tests = new Set(testIds);
  const units = new Set(unitIds);
  const out = new Map<string, string[]>(testIds.map((id) => [id, []]));
  for (const e of edges) {
    if (e.role !== CLASS_TEST_COVERS_ROLE || e.sourceType !== "scope") continue;
    if (!tests.has(e.sourceId) || !units.has(e.targetId)) continue;
    const list = out.get(e.sourceId);
    if (list && !list.includes(e.targetId)) list.push(e.targetId);
  }
  return out;
}

/** Soonest dated test first; undated after, then by name (natural order). */
export function sortTests<T extends { name: string; date: string | null }>(
  tests: readonly T[],
): T[] {
  return [...tests].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

/** What a test's material is made of: files, processed documents, notes. */
export const PRACTICE_TEST_SOURCE_TOKENS: readonly string[] = [
  "file",
  "processed_document",
  "note",
];

interface FiledItem {
  token: string;
  entityId: string;
}

/**
 * Everything filed in ANY of the covered units, each item once however many
 * of the units hold it. `groups` are the class's content groups (every item of
 * the class); `membership` is what each unit holds.
 */
export function itemsInUnits<I extends FiledItem>(
  groups: readonly { items: readonly I[] }[],
  membership: ReadonlyMap<string, ReadonlySet<string>>,
  unitIds: readonly string[],
): I[] {
  const wanted = new Set<string>();
  for (const id of unitIds) for (const key of membership.get(id) ?? []) wanted.add(key);
  const seen = new Set<string>();
  const out: I[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      const key = itemKey(item.token, item.entityId);
      if (!wanted.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** The files, documents and notes among a test's items — a practice test's sources. */
export function practiceTestSources<I extends FiledItem>(items: readonly I[]): I[] {
  return items.filter((i) => PRACTICE_TEST_SOURCE_TOKENS.includes(i.token));
}

/** The decks (`fc_set`) among a test's items — what "Study" reviews. */
export function testDeckIds(items: readonly FiledItem[]): string[] {
  return [...new Set(items.filter((i) => i.token === "fc_set").map((i) => i.entityId))];
}
