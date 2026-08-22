// features/settings/data-lifecycle/labels.ts
//
// THE RULE: a person never sees `entity_token`. "fc_card" is a table name, and
// this page has to make sense to someone who does not know what a table is.
//
// Three sources, in order: the retention policy's own label (an admin wrote it
// for exactly this notice), then the canonical entity registry
// (`platform.entity_types.label`, already generated into the client via
// `entityRegistry` — no new data path), then a humanized token as a last resort
// so a brand-new entity still reads as English instead of code.

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
  if (policyLabel?.trim()) return policyLabel.trim();
  const info = tryGetEntityInfo(entityToken);
  if (info) return info.labelPlural;
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
