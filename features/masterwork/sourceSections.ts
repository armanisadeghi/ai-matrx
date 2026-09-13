// features/masterwork/sourceSections.ts
//
// 🚨 WHICH PART OF A SOURCE WENT THIN — read off the rules themselves.
//
// The wall this closes (W42, 2026-09-12, real): a 31,311-word book was read
// into a Rulebook as six equal chunks and gave 116 rules, evenly — 15, 21, 16,
// 23, 19, 22, whatever the chunk held. Its chapter five ("Night- and day-time
// care of the child", 6,716 words, the chapter a parent's bedtime question
// lands on) contributed THREE. Pasted on its own it gave 89. Nothing on any
// screen said the book had a hole in it; the Expert found out when the answers
// were wrong.
//
// The server now cuts a source at its own chapters and stamps every rule with
// the part it came from (`source_ref.section_index` / `section_label` /
// `section_words`). So the panel does not need the run's terminal payload to
// show yields: it reads the LIVE rules, which means a source distilled last
// week is just as legible as one distilled a minute ago.
//
// The thin verdict here mirrors the server's (`source_structure.thin_sections`)
// deliberately: a part is thin against the SOURCE'S OWN median, never against
// a number somebody picked — a book of checklists and a book of memoir have
// different honest yields, and only the source can say what normal is for it.

import type { RulebookRule } from "./types";

/** A part of one source, and what it actually produced. */
export interface SourceSectionYield {
  /** 1-based, in reading order — what `only_section` takes. */
  index: number;
  /** The source's own heading, or "Part N" when it had none. */
  label: string;
  words: number;
  rules: number;
  /** Rules per 1,000 words — the comparison the thin verdict is made on. */
  per1k: number;
  /** Far below what the rest of this source produced. */
  thin: boolean;
  /** The server already read this part a second time. */
  secondPass: boolean;
}

/** Mirrors `source_identity.url_source_key` (aidream). */
export function urlSourceKey(url: string): string {
  let raw = (url ?? "").trim();
  if (!raw) return "";
  const split = raw.indexOf("://");
  if (split > -1) {
    const scheme = raw.slice(0, split).toLowerCase();
    const rest = raw.slice(split + 3);
    const slash = rest.indexOf("/");
    raw =
      slash > -1
        ? `${scheme}://${rest.slice(0, slash).toLowerCase()}${rest.slice(slash)}`
        : `${scheme}://${rest.toLowerCase()}`;
  }
  if (raw.endsWith("/") && (raw.match(/\//g)?.length ?? 0) > 2) {
    raw = raw.slice(0, -1);
  }
  return `url:${raw}`;
}

/** Mirrors `source_identity.entity_source_key` (aidream). */
export function entitySourceKey(token: string, id: string): string {
  const kind = (token ?? "").trim().toLowerCase();
  if (kind === "file") return `file:${(id ?? "").trim()}`;
  return `entity:${kind}:${(id ?? "").trim()}`;
}

/** Same threshold as the server's second pass — see the header. */
const THIN_FRACTION = 0.5;
/** Below this a part is too short for its rate to mean anything. */
// KNOB MIRROR of platform.feature_knob "masterwork_distillation" "thin_part_min_words" — a synchronous pure function.
// Change the row, then re-mirror this literal; the value has no sync read path.
const MIN_WORDS = 800;

/**
 * What each part of ONE source produced, in reading order.
 *
 * Empty when the source has no parts — a source with no detectable structure
 * is one undifferentiated read, and a single fake row would say nothing.
 */
export function sourceSectionYields(
  rules: RulebookRule[] | undefined,
  sourceKey: string,
): SourceSectionYield[] {
  if (!sourceKey) return [];
  const byIndex = new Map<number, SourceSectionYield>();
  for (const rule of rules ?? []) {
    const ref = rule.source_ref;
    if (!ref || ref.source !== sourceKey) continue;
    const index = ref.section_index;
    if (typeof index !== "number" || index < 1) continue;
    const row = byIndex.get(index) ?? {
      index,
      label: ref.section_label || `Part ${index}`,
      words: ref.section_words ?? 0,
      rules: 0,
      per1k: 0,
      thin: false,
      secondPass: false,
    };
    row.rules += 1;
    row.words = Math.max(row.words, ref.section_words ?? 0);
    if (ref.second_pass) row.secondPass = true;
    byIndex.set(index, row);
  }
  const rows = [...byIndex.values()].sort((a, b) => a.index - b.index);
  for (const row of rows) {
    row.per1k = row.words ? (1000 * row.rules) / row.words : 0;
  }

  const comparable = rows.filter((row) => row.words >= MIN_WORDS);
  if (comparable.length >= 2) {
    const rates = comparable.map((row) => row.per1k).sort((a, b) => a - b);
    const middle = Math.floor(rates.length / 2);
    const median =
      rates.length % 2
        ? rates[middle]
        : (rates[middle - 1] + rates[middle]) / 2;
    if (median > 0) {
      for (const row of comparable) {
        row.thin = row.per1k < THIN_FRACTION * median;
      }
    }
  }
  return rows;
}
