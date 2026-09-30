/**
 * nounOptions — how the builder offers ~1,100 nouns without a scroll wall.
 *
 * The catalog is noun × verb; what a person is looking for is "a thing I can
 * <verb> right now". So the options are grouped by the chosen verb's state:
 * wired first (writable nouns leading — they are what gets tested), then
 * planned, then unavailable — the last two folded behind a "More" row until
 * searched. Every option carries its human label (the server's `label`) and
 * is searchable by label, token and family (OptionCombobox matches all three
 * through `getLabel` / `getHint`).
 */

import type { OptionComboboxGroup } from "@/components/official/option-combobox/OptionCombobox";
import {
  cellState,
  type DirectiveState,
  type DirectiveVerb,
  type NounDirectives,
} from "@/features/directive-catalog/types";

const STATE_ORDER: readonly DirectiveState[] = ["yes", "planned", "no"];

function isWritable(noun: NounDirectives): boolean {
  return (
    noun.create === "yes" || noun.update === "yes" || noun.delete === "yes"
  );
}

/** The person-facing name: the server's label, else the token humanized. */
export function nounLabel(noun: NounDirectives): string {
  const label = noun.label?.trim();
  if (label) return label;
  const words = noun.noun.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Wired-and-writable first, then wired, each alphabetical by label. */
function compareNouns(a: NounDirectives, b: NounDirectives): number {
  const wa = isWritable(a) ? 0 : 1;
  const wb = isWritable(b) ? 0 : 1;
  if (wa !== wb) return wa - wb;
  return nounLabel(a).localeCompare(nounLabel(b));
}

function headingFor(
  state: DirectiveState,
  verb: DirectiveVerb,
  count: number,
): string {
  if (state === "yes") return `Ready to ${verb} (${count})`;
  if (state === "planned") return `Planned for ${verb} (${count})`;
  return `Can't ${verb} (${count})`;
}

/** The noun choices for one verb, grouped by that verb's state. */
export function nounOptionGroups(
  nouns: readonly NounDirectives[],
  verb: DirectiveVerb,
): OptionComboboxGroup[] {
  const byState = new Map<DirectiveState, NounDirectives[]>();
  for (const noun of nouns) {
    const state = cellState(noun, verb);
    const bucket = byState.get(state);
    if (bucket) bucket.push(noun);
    else byState.set(state, [noun]);
  }
  const groups: OptionComboboxGroup[] = [];
  for (const state of STATE_ORDER) {
    const bucket = byState.get(state);
    if (!bucket || bucket.length === 0) continue;
    bucket.sort(compareNouns);
    groups.push({
      heading: headingFor(state, verb, bucket.length),
      options: bucket.map((n) => n.noun),
      collapsed: state !== "yes",
    });
  }
  return groups;
}

/**
 * The muted text after a noun's label: its token when the label does not
 * already say it, and its family unless that is the catch-all "Other".
 */
export function nounHint(noun: NounDirectives): string | null {
  const parts: string[] = [];
  const spokenToken = noun.noun.replace(/_/g, " ").toLowerCase();
  if (nounLabel(noun).toLowerCase() !== spokenToken) parts.push(noun.noun);
  if (noun.family && noun.family !== "Other") parts.push(noun.family);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The noun the builder opens on: the first option of the verb's wired group
 * (a writable noun when one exists), so the first thing on screen can run.
 * Falls back to the first noun at all; empty string for an empty catalog.
 */
export function defaultNounFor(
  nouns: readonly NounDirectives[],
  verb: DirectiveVerb,
): string {
  const groups = nounOptionGroups(nouns, verb);
  return groups[0]?.options[0] ?? "";
}
