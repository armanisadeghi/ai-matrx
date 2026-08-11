/**
 * features/marketing/discovery-classification.ts
 *
 * The discovery inbox's CLASSIFICATION vocabulary — the one place that knows
 * what type a discovered candidate may be given. Deliberately React-free (it
 * imports only the canonical `types.ts` constants and the pure
 * `discovery-promotion` classifier) so all three consumers share it without a
 * cycle:
 *
 *  - `DiscoveryInbox` renders its per-row type Select and its bulk
 *    "Set type for selected" Select from these pools,
 *  - `marketing-discovery.manifest.ts` interpolates the pools into its
 *    `writeTargets` contract prose, and
 *  - the inbox's `item_classifications` write handler validates agent input
 *    against the very same pools.
 *
 * The point is that the enum an agent is TOLD about, the enum its value is
 * CHECKED against, and the enum the UI actually renders cannot drift apart —
 * they are all these lists. Never re-type these literals at a call site.
 *
 * THE POOL IS CHOSEN BY THE ITEM'S CATEGORY, not by the caller. A discovered
 * item in `media` is promoted to a `web.brand_asset`, one in `social` to a
 * `web.property`, and everything else to a `web.business_fact` — three
 * different destination tables with three different CHECK constraints. That
 * is why classification is a per-item decision that must be validated against
 * THAT item's pool: an asset kind on a social row is not a typo the UI can
 * absorb, it is a value the confirm mutation would reject at the database.
 */

import {
  BRAND_ASSET_KINDS,
  BRAND_ASSET_KIND_LABELS,
  BUSINESS_FACT_KINDS,
  BUSINESS_FACT_KIND_LABELS,
  PROPERTY_KINDS,
  PROPERTY_KIND_LABELS,
  type DiscoveredItem,
} from "@/features/marketing/types";
import { inferDiscoveredPropertyType } from "@/features/marketing/lib/discovery-promotion";

/** One selectable type, exactly as the inbox's Select renders it. */
export interface DiscoveryKindOption {
  value: string;
  label: string;
}

/** Which type pool a category's rows choose from (drives the row + bulk Selects). */
export type KindPool = "asset" | "property" | "fact";

export function isMediaCategory(category: string): boolean {
  return category === "media";
}

export function isSocialCategory(category: string): boolean {
  return category === "social";
}

/** The pool a category promotes into. Every non-media, non-social row is a fact. */
export function kindPoolOf(category: string): KindPool {
  if (isMediaCategory(category)) return "asset";
  if (isSocialCategory(category)) return "property";
  return "fact";
}

export const ASSET_KINDS: readonly DiscoveryKindOption[] = BRAND_ASSET_KINDS.map(
  (value) => ({ value, label: BRAND_ASSET_KIND_LABELS[value] }),
);

export const FACT_KINDS: readonly DiscoveryKindOption[] =
  BUSINESS_FACT_KINDS.map((value) => ({
    value,
    label: BUSINESS_FACT_KIND_LABELS[value],
  }));

/**
 * Social rows become `web.property` rows — every property kind EXCEPT
 * `website`, which is managed through its own site, never promoted from a
 * discovered social profile.
 */
export const PROPERTY_TYPE_OPTIONS: readonly DiscoveryKindOption[] =
  PROPERTY_KINDS.filter((value) => value !== "website").map((value) => ({
    value,
    label: PROPERTY_KIND_LABELS[value],
  }));

export function kindOptionsFor(pool: KindPool): readonly DiscoveryKindOption[] {
  return pool === "asset"
    ? ASSET_KINDS
    : pool === "property"
      ? PROPERTY_TYPE_OPTIONS
      : FACT_KINDS;
}

/** Runtime guard — the check the write handler runs on agent input. */
export function isKindInPool(pool: KindPool, kind: unknown): kind is string {
  return (
    typeof kind === "string" &&
    kindOptionsFor(pool).some((option) => option.value === kind)
  );
}

/**
 * The type a row starts on before anyone overrides it: the machine's guess
 * when it is a member of the row's pool, otherwise the pool's trailing
 * `other`. Social rows defer to the canonical URL classifier.
 */
export function defaultKind(item: DiscoveredItem): string {
  if (isSocialCategory(item.category)) return inferDiscoveredPropertyType(item);
  const guess = item.guessed_kind ?? "";
  const pool = kindOptionsFor(kindPoolOf(item.category));
  if (pool.some((option) => option.value === guess)) return guess;
  return pool[pool.length - 1].value;
}

/**
 * The kind that DEMANDS a label. Confirming an `other` row with no label is
 * refused for the user (the Confirm button disables) and must be refused for
 * an agent too — otherwise the agent stages a row the human cannot confirm.
 */
export const LABEL_REQUIRED_KIND = "other";

/** `"logo | logo_dark | …"` — interpolate this into prose, never re-type it. */
export function kindEnumText(pool: KindPool): string {
  return kindOptionsFor(pool)
    .map((option) => option.value)
    .join(" | ");
}

/**
 * The three pools as model-facing prose, for the write-target contract. Each
 * entry names which categories route to it and spells out its full enum, so
 * the agent is told exactly the list it will be validated against.
 */
export const DISCOVERY_KIND_POOL_PROSE: string = (
  [
    ["asset", 'category "media"'],
    ["property", 'category "social"'],
    ["fact", "every other category (identity, fact, link, other)"],
  ] as ReadonlyArray<[KindPool, string]>
)
  .map(([pool, applies]) => `${applies} → ${kindEnumText(pool)}`)
  .join("; ");
