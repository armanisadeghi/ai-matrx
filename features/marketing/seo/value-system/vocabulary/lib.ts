/**
 * Band-vocabulary editor helpers — pure functions only.
 *
 * The coherence checks here are for INLINE feedback while typing. They are not
 * the rule: seo.gsc_assert_vocabulary_coherent is, and every save goes through
 * it. These exist so the live preview isn't fired at a draft the DB would
 * reject, and so the user sees the problem beside the field that caused it.
 * If the two ever disagree, the database is right.
 */

import type { ValueBandDef, VocabKind, VocabularyDraftRow } from "../types";

/** The band the resolver emits for keywords no meaning reaches. Never assignable. */
export const RESERVED_UNVALUED = "unvalued";
/** The band the resolver emits for excluded geo / not-offered / actively-avoided. */
export const RESERVED_NEGATIVE = "negative";

export function slugifyVocabValue(label: string): string {
  return label
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function toDraftRows(vocab: ValueBandDef[]): VocabularyDraftRow[] {
  return [...vocab]
    .sort((a, b) => a.sort - b.sort)
    .map((def, index) => ({
      value: def.value,
      label: def.label,
      description: def.description,
      sort: index,
      config: { ...def.config },
    }));
}

export function minScoreOf(row: VocabularyDraftRow): number | null {
  const raw = row.config?.min_score;
  return typeof raw === "number" ? raw : null;
}

export function multiplierOf(row: VocabularyDraftRow): number | null {
  const raw = row.config?.multiplier;
  return typeof raw === "number" ? raw : null;
}

export function isReservedNegative(row: VocabularyDraftRow): boolean {
  return row.value === RESERVED_NEGATIVE;
}

export interface DraftIssue {
  /** Row identity the problem belongs to, or null for a whole-set problem. */
  value: string | null;
  message: string;
}

/** Mirrors the DB predicate closely enough to keep the preview honest. */
export function findDraftIssues(
  kind: VocabKind,
  rows: VocabularyDraftRow[],
): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (rows.length < 2) {
    issues.push({ value: null, message: "A vocabulary needs at least two entries." });
  }

  const seenLabels = new Map<string, string>();
  for (const row of rows) {
    if (!row.label.trim()) {
      issues.push({ value: row.value, message: "Needs a name — the name is what every keyword is labelled with." });
      continue;
    }
    const key = row.label.trim().toLowerCase();
    const owner = seenLabels.get(key);
    if (owner && owner !== row.value) {
      issues.push({ value: row.value, message: "Another band already has this name." });
    } else {
      seenLabels.set(key, row.value);
    }
  }

  if (kind === "value_band") {
    if (!rows.some(isReservedNegative)) {
      issues.push({
        value: null,
        message: "The reserved Negative band must stay — the resolver emits it for excluded geo, not-offered services and actively-avoided topics.",
      });
    }
    const scored = rows.filter((row) => !isReservedNegative(row));
    const seenScores = new Map<number, string>();
    for (const row of scored) {
      const min = minScoreOf(row);
      if (min === null) {
        issues.push({ value: row.value, message: "Needs a minimum score." });
        continue;
      }
      if (min < 0) {
        issues.push({ value: row.value, message: "Scores cannot be below 0." });
        continue;
      }
      const owner = seenScores.get(min);
      if (owner && owner !== row.value) {
        issues.push({ value: row.value, message: "Another band already starts here — a score would land in both." });
      } else {
        seenScores.set(min, row.value);
      }
    }
    if (scored.length > 0 && !scored.some((row) => minScoreOf(row) === 0)) {
      issues.push({
        value: null,
        message: "One band must start at 0, or the lowest-scoring keywords land in no band at all.",
      });
    }
  } else {
    for (const row of rows) {
      const mult = multiplierOf(row);
      if (mult === null) {
        issues.push({ value: row.value, message: "Needs a multiplier." });
      } else if (mult < 0 || mult > 10) {
        issues.push({ value: row.value, message: "Multipliers run 0–10." });
      }
    }
  }
  return issues;
}

/** Rows ordered the way the vocabulary reads: highest band first. */
export function orderedForDisplay(
  kind: VocabKind,
  rows: VocabularyDraftRow[],
): VocabularyDraftRow[] {
  if (kind === "geo_band") {
    return [...rows].sort((a, b) => (multiplierOf(b) ?? 0) - (multiplierOf(a) ?? 0));
  }
  return [...rows].sort((a, b) => {
    if (isReservedNegative(a)) return 1;
    if (isReservedNegative(b)) return -1;
    return (minScoreOf(b) ?? -1) - (minScoreOf(a) ?? -1);
  });
}

/** Identities present in the saved vocabulary but absent from the draft. */
export function removedValues(
  saved: ValueBandDef[],
  rows: VocabularyDraftRow[],
): string[] {
  const kept = new Set(rows.map((row) => row.value));
  return saved.map((def) => def.value).filter((value) => !kept.has(value));
}

/** Identities whose NAME changed — renaming re-labels every keyword instantly. */
export function renamedValues(
  saved: ValueBandDef[],
  rows: VocabularyDraftRow[],
): Array<{ value: string; from: string; to: string }> {
  const before = new Map(saved.map((def) => [def.value, def.label]));
  return rows
    .filter((row) => before.has(row.value) && before.get(row.value) !== row.label.trim())
    .map((row) => ({
      value: row.value,
      from: before.get(row.value) as string,
      to: row.label.trim(),
    }));
}
