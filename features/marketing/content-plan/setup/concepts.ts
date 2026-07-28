/**
 * features/marketing/content-plan/setup/concepts.ts
 *
 * The site CONCEPT LIBRARY — a menu, not a template.
 *
 * ── THE TWIN CONTRACT ──────────────────────────────────────────────────────
 * TypeScript twin of aidream's CANONICAL
 * `aidream/services/content_plan/concepts.py`. Resolution must be identical in
 * both languages: an archetype instantiated by the chat tool and one applied by
 * the Site Setup view have to land the same routes. Pinned by the shared
 * fixture `archetype-expansion-cases.json` + `pnpm check:archetype-expansion`.
 * If that check fails, fix THIS file — never the fixture.
 *
 * Three layers:
 *
 *  1. **Concept** — a thing a site can have (`home`, `about`, `services`, …).
 *     A row in the catalog at `plan.profile.template_map.concepts` (the SIBLING
 *     key of `.archetypes` on the same system-org row).
 *  2. **Variant** — a named composition that satisfies the concept. `about`
 *     ships `single` / `founder-and-team` / `founder-exec-everyone`. A variant
 *     emits EITHER fixed, real-named `pages` (which may nest `children`) OR one
 *     count-bearing `family` — never both, never neither.
 *  3. **Selection** — what an archetype takes: `{concept: {variant?, count?,
 *     brief?, child_brief?}}` plus the concepts it deliberately `omits`.
 *     **Count and variant are orthogonal and both optional.**
 *
 * Adding a concept or a variant is DATA. This module validates shape only; it
 * never enumerates concept names. Nothing is required except `home`.
 *
 * NOTE ON THE IMPORT CYCLE: `archetypes.ts` imports `resolveSelection` from
 * here and this module imports its parsers from there — the same shape as the
 * canonical Python pair. Every cross-reference is inside a function body, so
 * the cycle resolves at call time, never at module evaluation.
 */
import {
  ArchetypeError,
  asCountRef,
  asRecord,
  asString,
  asStringList,
  parseCore,
  parseFamily,
  rejectUnknownKeys,
  type ArchetypeCorePage,
  type ArchetypeFamily,
  type ArchetypeFoundationConfig,
  type CountRef,
} from "./archetypes";

/** `plan.profile.template_map` key holding the concept catalog. */
export const CONCEPT_MAP_KEY = "concepts";
/**
 * The one concept every site must take. Everything else is opt-in — including
 * contact ("they just take the things they want, they leave what they don't").
 */
export const REQUIRED_CONCEPT = "home";

// ── catalog shapes ─────────────────────────────────────────────────────────

/**
 * An optional-everywhere foundation declaration. A CONCEPT (or VARIANT)
 * contributes one when selected ("a service icon per service"); an ARCHETYPE
 * may override the merged result (`{assets: {service_icon: 0}}` DROPS an item
 * the menu would have added). Every field optional so a fragment adds without
 * re-asserting.
 */
export interface ConceptFoundationFragment {
  tokens: CountRef | null;
  header: CountRef | null;
  footer: CountRef | null;
  navEntries: CountRef | null;
  assets: Record<string, CountRef>;
}

/** One named composition that satisfies a concept. */
export interface ConceptVariant {
  key: string;
  label: string;
  description: string;
  /** Fixed, real-named pages (possibly nested). Empty when `family` is set. */
  pages: ArchetypeCorePage[];
  /** A count-bearing hub. Null when `pages` is set. */
  family: ArchetypeFamily | null;
  /**
   * Variant-specific foundation, merged AFTER the concept's own fragment. A
   * `"=<key>.count"` reference belongs HERE, on the variant that declares the
   * family — a page variant has no count to reference.
   */
  foundation: ConceptFoundationFragment;
}

/** One item on the menu. */
export interface Concept {
  key: string;
  label: string;
  description: string;
  /**
   * Menu position. Drives BOTH the order pages/families land in the tree and
   * the order foundation assets are listed, so the plan reads top-down the way
   * the menu does.
   */
  order: number;
  defaultVariant: string;
  variants: Record<string, ConceptVariant>;
  foundation: ConceptFoundationFragment;
}

/**
 * What a selection takes of ONE concept. `variant` and `count` are INDEPENDENT
 * and both optional. `brief` / `childBrief` let a curated archetype tighten the
 * authored text without forking a variant.
 */
export interface ConceptSelection {
  variant: string | null;
  count: number | null;
  brief: string[] | null;
  childBrief: string[] | null;
}

/** One selected concept, reported so a UI can show what it produced. */
export interface ResolvedConcept {
  concept: string;
  label: string;
  variant: string;
  variantLabel: string;
  order: number;
  familyKey: string | null;
  pageRoutes: string[];
}

/**
 * A selection materialized into the shapes `expandArchetype` already speaks —
 * core pages, families, foundation. The expander is untouched.
 */
export interface ResolvedSelection {
  core: ArchetypeCorePage[];
  families: ArchetypeFamily[];
  foundation: ArchetypeFoundationConfig;
  concepts: ResolvedConcept[];
  omits: string[];
}

// ── parsing ────────────────────────────────────────────────────────────────

const FRAGMENT_KEYS = [
  "tokens",
  "header",
  "footer",
  "nav_entries",
  "assets",
] as const;
const VARIANT_KEYS = [
  "label",
  "description",
  "pages",
  "family",
  "foundation",
] as const;
const CONCEPT_KEYS = [
  "label",
  "description",
  "order",
  "default_variant",
  "variants",
  "foundation",
] as const;
const SELECTION_KEYS = ["variant", "count", "brief", "child_brief"] as const;

function emptyFragment(): ConceptFoundationFragment {
  return { tokens: null, header: null, footer: null, navEntries: null, assets: {} };
}

/**
 * `null` and "absent" both mean "this fragment says nothing about it" — the
 * same as the canonical model's `CountRef | None = None`.
 */
function asOptionalCountRef(value: unknown, where: string): CountRef | null {
  if (value === undefined || value === null) return null;
  return asCountRef(value, where, 0);
}

export function parseFoundationFragment(
  raw: unknown,
  where: string,
): ConceptFoundationFragment {
  if (raw === undefined || raw === null) return emptyFragment();
  const row = asRecord(raw, where);
  rejectUnknownKeys(row, FRAGMENT_KEYS, where);
  const assetsRaw =
    row.assets === undefined || row.assets === null
      ? {}
      : asRecord(row.assets, `${where}.assets`);
  const assets: Record<string, CountRef> = {};
  for (const [key, value] of Object.entries(assetsRaw)) {
    assets[key] = asCountRef(value, `${where}.assets.${key}`, 0);
  }
  return {
    tokens: asOptionalCountRef(row.tokens, `${where}.tokens`),
    header: asOptionalCountRef(row.header, `${where}.header`),
    footer: asOptionalCountRef(row.footer, `${where}.footer`),
    navEntries: asOptionalCountRef(row.nav_entries, `${where}.nav_entries`),
    assets,
  };
}

function parseVariant(
  key: string,
  raw: unknown,
  where: string,
  problems: string[],
): ConceptVariant {
  const row = asRecord(raw, where);
  rejectUnknownKeys(row, VARIANT_KEYS, where);
  const label = asString(row.label, `${where}.label`, key);
  const pagesRaw = Array.isArray(row.pages) ? row.pages : [];
  const pages = pagesRaw.map((item, index) =>
    parseCore(item, `${where}.pages[${index}]`, problems),
  );
  const family =
    row.family === undefined || row.family === null
      ? null
      : parseFamily(row.family, `${where}.family`, problems);
  if ((pages.length > 0) === (family !== null)) {
    throw new ArchetypeError(
      `Concept variant "${label}" must declare exactly one of \`pages\` (named page composition) or \`family\` (a count-bearing hub).`,
    );
  }
  return {
    key,
    label,
    description: typeof row.description === "string" ? row.description : "",
    pages,
    family,
    foundation: parseFoundationFragment(row.foundation, `${where}.foundation`),
  };
}

function parseConcept(
  key: string,
  raw: unknown,
  where: string,
  problems: string[],
): Concept {
  const row = asRecord(raw, where);
  rejectUnknownKeys(row, CONCEPT_KEYS, where);
  const label = asString(row.label, `${where}.label`, key);
  const order = row.order === undefined ? 500 : Number(row.order);
  if (!Number.isInteger(order)) {
    throw new ArchetypeError(`${where}.order: must be a whole number.`);
  }
  const variantsRaw =
    row.variants === undefined || row.variants === null
      ? {}
      : asRecord(row.variants, `${where}.variants`);
  const variants: Record<string, ConceptVariant> = {};
  for (const [variantKey, value] of Object.entries(variantsRaw)) {
    variants[variantKey] = parseVariant(
      variantKey,
      value,
      `${where}.variants.${variantKey}`,
      problems,
    );
  }
  if (Object.keys(variants).length === 0) {
    throw new ArchetypeError(`Concept "${label}" declares no variants.`);
  }
  const defaultVariant = asString(row.default_variant, `${where}.default_variant`);
  if (!(defaultVariant in variants)) {
    throw new ArchetypeError(
      `Concept "${label}" default_variant "${defaultVariant}" is not one of its variants: ${Object.keys(variants).sort().join(", ")}.`,
    );
  }
  return {
    key,
    label,
    description: typeof row.description === "string" ? row.description : "",
    order,
    defaultVariant,
    variants,
    foundation: parseFoundationFragment(row.foundation, `${where}.foundation`),
  };
}

/**
 * Validate a `template_map.concepts` blob. Loud on a malformed entry — a
 * half-parsed catalog silently removes options from the menu.
 */
export function parseConceptCatalog(
  raw: unknown,
  where: string,
  problems: string[] = [],
): Record<string, Concept> {
  if (raw === undefined || raw === null) return {};
  const map = asRecord(
    raw,
    `${where}: "concepts" must be an object keyed by concept name`,
  );
  const out: Record<string, Concept> = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = parseConcept(key, value, `${where}.${key}`, problems);
  }
  return out;
}

/** One concept pick, validated. Unknown keys are REJECTED (`extra="forbid"`). */
export function parseConceptSelection(raw: unknown, where: string): ConceptSelection {
  const row = asRecord(raw, where);
  rejectUnknownKeys(row, SELECTION_KEYS, where);
  let count: number | null = null;
  if (row.count !== undefined && row.count !== null) {
    count = Number(row.count);
    if (!Number.isInteger(count)) {
      throw new ArchetypeError(`${where}.count: must be a whole number.`);
    }
  }
  return {
    variant:
      typeof row.variant === "string" && row.variant.trim() ? row.variant.trim() : null,
    count,
    brief:
      row.brief === undefined || row.brief === null
        ? null
        : asStringList(row.brief, `${where}.brief`),
    childBrief:
      row.child_brief === undefined || row.child_brief === null
        ? null
        : asStringList(row.child_brief, `${where}.child_brief`),
  };
}

// ── resolution ─────────────────────────────────────────────────────────────

/**
 * Full routes, not bare slugs — `/about/team` and `/team` are different pages
 * from different concepts and must never share a provenance key.
 */
export function pageRoutes(pages: ArchetypeCorePage[], prefix = ""): string[] {
  const out: string[] = [];
  for (const page of pages) {
    const route = page.slug ? `${prefix}/${page.slug}` : "/";
    out.push(route);
    out.push(...pageRoutes(page.children, route));
  }
  return out;
}

/**
 * Apply a selection's brief override to the TOP page of a composition — the
 * sub-pages keep the variant's own authored briefs.
 */
function withBrief(page: ArchetypeCorePage, brief: string[] | null): ArchetypeCorePage {
  if (brief === null) return page;
  return { ...page, brief: [...brief] };
}

export interface ResolveSelectionOptions {
  omits?: string[];
  foundationOverrides?: ConceptFoundationFragment | null;
  where?: string;
}

/**
 * Turn `{concept: {variant, count?}}` into core pages + families + foundation.
 * Pure — no IO.
 *
 * Loud on every miss: an unknown concept, an unknown variant, a count on a
 * variant that has no family, or a missing `home`. A silently-dropped concept
 * is a page nobody ever builds.
 */
export function resolveSelection(
  catalog: Record<string, Concept>,
  selection: Record<string, ConceptSelection>,
  options: ResolveSelectionOptions = {},
): ResolvedSelection {
  const where = options.where ?? "selection";
  const omits = options.omits ?? [];
  const offered = Object.keys(catalog).sort().join(", ");

  const unknown = Object.keys(selection)
    .filter((key) => !(key in catalog))
    .sort();
  if (unknown.length > 0) {
    throw new ArchetypeError(
      `${where}: unknown concept(s) ${unknown.join(", ")}. The catalog offers: ${offered}.`,
    );
  }
  const unknownOmits = omits.filter((key) => !(key in catalog)).sort();
  if (unknownOmits.length > 0) {
    throw new ArchetypeError(
      `${where}: omits unknown concept(s) ${unknownOmits.join(", ")}. The catalog offers: ${offered}.`,
    );
  }
  const overlap = Object.keys(selection)
    .filter((key) => omits.includes(key))
    .sort();
  if (overlap.length > 0) {
    throw new ArchetypeError(
      `${where}: concept(s) ${overlap.join(", ")} are both selected and omitted.`,
    );
  }
  if (!(REQUIRED_CONCEPT in selection)) {
    throw new ArchetypeError(
      `${where}: every site must take the "${REQUIRED_CONCEPT}" concept. Nothing else is required.`,
    );
  }

  const ordered = Object.keys(selection).sort(
    (a, b) => catalog[a].order - catalog[b].order || (a < b ? -1 : a > b ? 1 : 0),
  );

  const core: ArchetypeCorePage[] = [];
  const families: ArchetypeFamily[] = [];
  const resolved: ResolvedConcept[] = [];
  // Menu order, not jsonb order and not alphabetical: the checklist should read
  // the way the menu reads.
  const assets = new Map<string, CountRef>();
  const scalars = new Map<"tokens" | "header" | "footer" | "navEntries", CountRef>();

  for (const key of ordered) {
    const concept = catalog[key];
    const picked = selection[key];
    const variantKey = picked.variant ?? concept.defaultVariant;
    const variant = concept.variants[variantKey];
    if (!variant) {
      throw new ArchetypeError(
        `${where}: concept "${key}" has no variant "${variantKey}". Variants: ${Object.keys(concept.variants).sort().join(", ")}.`,
      );
    }

    if (variant.family !== null) {
      let family: ArchetypeFamily = { ...variant.family };
      if (picked.count !== null) {
        if (picked.count < 0) {
          throw new ArchetypeError(`${where}: ${key}.count ${picked.count} is negative.`);
        }
        family = { ...family, count: picked.count };
      }
      if (picked.brief !== null) family = { ...family, brief: [...picked.brief] };
      if (picked.childBrief !== null) {
        family = { ...family, childBrief: [...picked.childBrief] };
      }
      families.push(family);
      resolved.push({
        concept: key,
        label: concept.label,
        variant: variantKey,
        variantLabel: variant.label,
        order: concept.order,
        familyKey: family.key,
        pageRoutes: [],
      });
    } else {
      if (picked.count !== null) {
        throw new ArchetypeError(
          `${where}: concept "${key}" variant "${variantKey}" names its pages and takes no count. Counts belong to variants that declare a family (a hub plus N children).`,
        );
      }
      if (picked.childBrief !== null) {
        throw new ArchetypeError(
          `${where}: concept "${key}" variant "${variantKey}" has no family children, so child_brief has nothing to apply to.`,
        );
      }
      const pages = variant.pages.map((page) => withBrief(page, picked.brief));
      core.push(...pages);
      resolved.push({
        concept: key,
        label: concept.label,
        variant: variantKey,
        variantLabel: variant.label,
        order: concept.order,
        familyKey: null,
        pageRoutes: pageRoutes(pages),
      });
    }

    for (const fragment of [concept.foundation, variant.foundation]) {
      if (fragment.tokens !== null) scalars.set("tokens", fragment.tokens);
      if (fragment.header !== null) scalars.set("header", fragment.header);
      if (fragment.footer !== null) scalars.set("footer", fragment.footer);
      if (fragment.navEntries !== null) scalars.set("navEntries", fragment.navEntries);
      for (const [assetKey, raw] of Object.entries(fragment.assets)) {
        assets.set(assetKey, raw);
      }
    }
  }

  const overrides = options.foundationOverrides ?? null;
  if (overrides !== null) {
    if (overrides.tokens !== null) scalars.set("tokens", overrides.tokens);
    if (overrides.header !== null) scalars.set("header", overrides.header);
    if (overrides.footer !== null) scalars.set("footer", overrides.footer);
    if (overrides.navEntries !== null) scalars.set("navEntries", overrides.navEntries);
    for (const [assetKey, raw] of Object.entries(overrides.assets)) {
      assets.set(assetKey, raw);
    }
  }

  return {
    core,
    families,
    foundation: {
      tokens: scalars.get("tokens") ?? false,
      header: scalars.get("header") ?? 0,
      footer: scalars.get("footer") ?? 0,
      navEntries: scalars.get("navEntries") ?? 0,
      assets: Object.fromEntries(assets),
    },
    concepts: resolved,
    omits: [...omits],
  };
}
