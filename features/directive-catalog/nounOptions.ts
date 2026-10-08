import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
/**
 * nounOptions — how the builder offers ~1,100 nouns without a scroll wall.
 *
 * The catalog is noun × verb; what a person is looking for is "a thing I can
 * <verb> right now". So the options lead with the COMMON types — the org's
 * `platform.reference_picker.common_types` knob, the same tier the right-click
 * reference picker shows first (`useCommonReferenceTypes`), never a list in
 * code — then the rest grouped by the chosen verb's state: wired (writable
 * nouns leading), planned, unavailable; the last two folded behind a "More"
 * row until searched. Every option carries its human label (the picker's
 * friendly name, else the server's `label`) and is searchable by label, token
 * and family (OptionCombobox matches all three through `getLabel` / `getHint`).
 *
 * There is deliberately NO default noun: any noun chosen for the person is a
 * guess (the 2026-09-30 defect opened on `access_delta_probe`), so the builder
 * opens on "Choose a type" with the common tier on top.
 */

import type { OptionComboboxGroup } from "@ai-matrx/design-system/controls";
import { CATALOG_ALIASES } from "@/features/matrx-envelope/catalog-nouns.generated";
import { FRIENDLY_REFERENCE_TYPE_LABELS } from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";
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

/**
 * The person-facing name: the reference picker's friendly name (a
 * conversation is a "Chat" everywhere a person picks one), else the server's
 * label, else the token humanized.
 */
export function nounLabel(noun: NounDirectives): string {
  const friendly = FRIENDLY_REFERENCE_TYPE_LABELS[noun.noun];
  if (friendly) return friendly;
  const label = noun.label?.trim();
  if (label) return label;
  return humanizeIdentifier(noun.noun) || noun.noun;
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

/**
 * The common tier resolved against this catalog: knob tokens (aliases
 * followed, e.g. `document` → `udt_document`) that name a real noun, in knob
 * order, each once. A token the catalog does not carry is skipped, never
 * drawn as a dead option.
 */
export function commonNounTokens(
  nouns: readonly NounDirectives[],
  commonTokens: readonly string[],
  aliases: Readonly<Record<string, string>> = CATALOG_ALIASES,
): string[] {
  const known = new Set(nouns.map((n) => n.noun));
  const out: string[] = [];
  for (const raw of commonTokens) {
    const token = aliases[raw] ?? raw;
    if (known.has(token) && !out.includes(token)) out.push(token);
  }
  return out;
}

/**
 * The noun choices for one verb: the common tier first (when the knob gave
 * one), then the rest grouped by that verb's state. Every noun appears once.
 */
export function nounOptionGroups(
  nouns: readonly NounDirectives[],
  verb: DirectiveVerb,
  common: readonly string[] = [],
): OptionComboboxGroup[] {
  const commonSet = new Set(common);
  const byState = new Map<DirectiveState, NounDirectives[]>();
  for (const noun of nouns) {
    if (commonSet.has(noun.noun)) continue;
    const state = cellState(noun, verb);
    const bucket = byState.get(state);
    if (bucket) bucket.push(noun);
    else byState.set(state, [noun]);
  }
  const groups: OptionComboboxGroup[] = [];
  if (common.length > 0) {
    groups.push({ heading: "Common", options: [...common], collapsed: false });
  }
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
