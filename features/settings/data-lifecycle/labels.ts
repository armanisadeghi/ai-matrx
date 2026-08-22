// features/settings/data-lifecycle/labels.ts
//
// THE RULE: a person never sees `entity_token`. "fc_card" is a table name, and
// this page has to make sense to someone who does not know what a table is.
//
// Three sources, in order:
//   1. the canonical entity registry (`platform.entity_types.label`, already
//      generated into the client via `entityRegistry` — no new data path),
//   2. the retention policy's own `label`,
//   3. a humanized token, so a brand-new entity still reads as English.
//
// 🚨 The registry comes FIRST, and that ordering is load-bearing. A retention
// policy is written at a SCOPE — user, organization, taxonomy node, global —
// and only the `entity` scope names one entity, so its label is usually a
// sentence about the whole scope. Verified live 2026-08-22: a user-scoped
// policy labelled "Flashcard decks you deleted" is the winning policy for
// EVERY one of that user's entities, so trusting it first labelled that
// person's rulebooks as flashcard decks. The registry label is per-entity by
// construction and cannot be wrong that way; the policy label is the fallback
// for a token the registry does not carry.

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

/** "fc_card" → "Fc card" — the last-resort phrase, never raw snake_case. */
function humanize(token: string): string {
  const words = token.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Saved items";
}

/**
 * The plural, human name for a group of rows of one entity.
 * `policyLabel` is the policy's `label` when the notice carried one.
 */
export function lifecycleLabel(
  entityToken: string,
  policyLabel?: string | null,
): string {
  const info = tryGetEntityInfo(entityToken);
  if (info) return info.labelPlural;
  if (policyLabel?.trim()) return policyLabel.trim();
  return humanize(entityToken);
}

/** "3 items" / "1 item" — the only count phrasing this page uses. */
export function itemCount(rows: number): string {
  return `${rows.toLocaleString()} ${rows === 1 ? "item" : "items"}`;
}

/** "in 6 days" / "tomorrow" / "today" — never a raw day integer. */
export function whenPhrase(daysLeft: number | null): string {
  if (daysLeft === null) return "soon";
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

/** "August 29, 2026" — the exact date, spelled out. */
export function longDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
