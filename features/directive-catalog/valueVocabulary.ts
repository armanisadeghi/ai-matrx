import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
/**
 * The words a pick-list shows for a stored value — the SAME words the record's
 * own screens show. A schema publishes only stored values ("inbox",
 * "incomplete", "active"); the Task window says "In progress". A generated form
 * that prints the stored value speaks a second language (G6B review,
 * 2026-10-02).
 *
 * Nothing here is authored: each entry points at the feature's own canonical
 * vocabulary constant, the one its screens read. A value no feature names
 * falls back to sentence case ("in_review" → "In review").
 *
 * `canonical` folds a legacy stored value onto the value it means today
 * (`incomplete` → `inbox` for tasks), so the list never offers two choices
 * that mean the same thing.
 */

import {
  TASK_STATUS_META,
  normalizeTaskStatus,
} from "@/features/tasks/constants/status";
import { PROJECT_STATUS_LABEL } from "@/features/projects/constants/status";

export interface ValueVocabulary {
  labels: Readonly<Record<string, string>>;
  canonical?: (value: string) => string;
}

const TASK_STATUS_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(TASK_STATUS_META).map((m) => [m.value, m.label]),
);

/** record type → field → the feature's own vocabulary. */
const VOCABULARIES: Readonly<Record<string, Readonly<Record<string, ValueVocabulary>>>> = {
  task: {
    status: { labels: TASK_STATUS_LABEL, canonical: normalizeTaskStatus },
  },
  project: {
    status: { labels: PROJECT_STATUS_LABEL },
  },
};

/** The vocabulary for one field of one record type, or null. */
export function valueVocabularyFor(
  noun: string,
  key: string,
): ValueVocabulary | null {
  return VOCABULARIES[noun]?.[key] ?? null;
}

/** A stored value no vocabulary names, in sentence case. */
export function sentenceCaseValue(value: string): string {
  return humanizeIdentifier(value) || value;
}

/**
 * The word a person reads for one stored value of one field — the same word
 * the record's own screens show ("incomplete" on a task reads "Inbox").
 * Consumers: write-form pick-lists (`schemaFields.ts`) and the record search's
 * secondary line (`features/scopes/service/recordFacts.ts`), and every directive
 * card and confirm (`matrxDirectiveValueLabel` in `features/matrx-envelope/directiveHost.tsx`).
 */
export function valueWord(noun: string, key: string, value: string): string {
  const vocabulary = valueVocabularyFor(noun, key);
  const canonical = vocabulary?.canonical?.(value) ?? value;
  return (
    vocabulary?.labels[canonical] ?? vocabulary?.labels[value] ?? sentenceCaseValue(value)
  );
}
