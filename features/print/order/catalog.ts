/**
 * Typed catalog builder + reactive constraint engine for the Lulu catalog.
 *
 * `GET /lulu/catalog` is bound to the generated OpenAPI contract
 * (`PrintCatalog` — the server's ingestion of Lulu's machine-readable Product
 * Spec Sheet), so `buildCatalog` does direct field access, no tolerant
 * readers. NOTHING about the product matrix is hardcoded here: the option
 * lists, the page windows, and every availability verdict are derived from
 * the products the server sends.
 *
 * The catalog's five UI dimensions map onto products like this: a product's
 * `interior_color` × `print_quality` pair collapses into ONE "interior color"
 * option (exactly how Lulu's own calculator presents it), and the hardcover
 * linen/foil variants collapse onto their plain sibling — the demo prices the
 * base configuration of each five-dimension combination.
 */

import type { components } from "@/types/python-generated/api-types";
import type {
  LuluBindingGroup,
  LuluBindingOption,
  LuluCatalog,
  LuluCombination,
  LuluDimension,
  LuluOption,
  LuluSelection,
  LuluTrimOption,
  OptionAvailability,
  PageWindow,
} from "./types";

type PrintCatalog = components["schemas"]["PrintCatalog"];
type CatalogProduct = components["schemas"]["CatalogProduct"];
// ---------------------------------------------------------------------------
// Building the view model from the contract-typed catalog
// ---------------------------------------------------------------------------

const IN_TO_MM = 25.4;

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toNumber(value: string | null | undefined): number | null {
  if (value == null || value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The composite "interior color" option: Lulu's calculator presents
 * interior color × print quality as ONE choice, and so do we.
 */
const COLOR_ID_SEPARATOR = " · ";

function colorIdFor(product: CatalogProduct): string | null {
  if (!product.interior_color || !product.print_quality) return null;
  return `${product.interior_color}${COLOR_ID_SEPARATOR}${product.print_quality}`;
}

/** Case Wrap and Linen Wrap are the hardcovers; everything else is soft. */
function bindingGroupFor(binding: string): LuluBindingGroup {
  return /wrap/i.test(binding) ? "hardcover" : "paperback";
}

/**
 * Hardcover linen/foil variants (and print-inside-cover twins) share the five
 * UI dimensions with a plain sibling; the plain product is the one we price.
 */
function isPlainProduct(product: CatalogProduct): boolean {
  return (
    product.linen_color == null &&
    product.foil_color == null &&
    product.print_inside_cover !== true
  );
}

function toCombination(product: CatalogProduct): LuluCombination | null {
  const colorId = colorIdFor(product);
  if (
    !product.trim_sku ||
    !product.binding ||
    !colorId ||
    !product.paper_type ||
    !product.lamination
  ) {
    return null;
  }
  return {
    trimId: product.trim_sku,
    bindingId: product.binding,
    colorId,
    paperId: product.paper_type,
    coverFinishId: product.lamination,
    minPages: product.min_page_count ?? null,
    maxPages: product.max_page_count ?? null,
    podPackageId: product.pod_package_id,
  };
}

export function buildCatalog(raw: PrintCatalog): LuluCatalog {
  const products = raw.products ?? [];

  // One combination per distinct five-dimension key, plain variant preferred.
  const combinationsByKey = new Map<
    string,
    { combination: LuluCombination; plain: boolean }
  >();
  for (const product of products) {
    const combination = toCombination(product);
    if (!combination) continue;
    const key = [
      combination.trimId,
      combination.bindingId,
      combination.colorId,
      combination.paperId,
      combination.coverFinishId,
    ].join("|");
    const plain = isPlainProduct(product);
    const existing = combinationsByKey.get(key);
    if (!existing || (plain && !existing.plain)) {
      combinationsByKey.set(key, { combination, plain });
    }
  }
  const combinations = [...combinationsByKey.values()].map(
    (entry) => entry.combination,
  );

  // Trims: the sheet's own trim list (its order is the display order), with
  // geometry pulled from any product at that trim.
  const productByTrim = new Map<string, CatalogProduct>();
  for (const product of products) {
    if (product.trim_sku && !productByTrim.has(product.trim_sku)) {
      productByTrim.set(product.trim_sku, product);
    }
  }
  const referencedTrims = new Set(combinations.map((entry) => entry.trimId));
  const trims: LuluTrimOption[] = (raw.trims ?? [])
    .filter((trim) => referencedTrims.has(trim.trim_sku))
    .map((trim) => {
      const sample = productByTrim.get(trim.trim_sku);
      const widthIn = toNumber(sample?.trim_width_in);
      const heightIn = toNumber(sample?.trim_height_in);
      const widthMm =
        toNumber(sample?.trim_width_mm) ??
        (widthIn === null ? null : roundTo(widthIn * IN_TO_MM, 0));
      const heightMm =
        toNumber(sample?.trim_height_mm) ??
        (heightIn === null ? null : roundTo(heightIn * IN_TO_MM, 0));
      const mm =
        widthMm !== null && heightMm !== null
          ? ` · ${widthMm} × ${heightMm} mm`
          : "";
      return {
        id: trim.trim_sku,
        label: `${trim.book_type} — ${trim.inches_label}`,
        sublabel: `${trim.size_class}${mm}`,
        widthIn,
        heightIn,
        widthMm,
        heightMm,
      };
    });

  // The remaining option lists come straight from what the combinations
  // reference — an option that no product carries must not render.
  const bindings: LuluBindingOption[] = [];
  const colors: LuluOption[] = [];
  const papers: LuluOption[] = [];
  const coverFinishes: LuluOption[] = [];
  const seen = new Set<string>();
  const add = <T extends LuluOption>(list: T[], option: T) => {
    const key = `${list === (bindings as LuluOption[]) ? "b" : list === colors ? "c" : list === papers ? "p" : "f"}:${option.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(option);
  };
  for (const combination of combinations) {
    add(bindings, {
      id: combination.bindingId,
      label: combination.bindingId,
      sublabel: null,
      group: bindingGroupFor(combination.bindingId),
    });
    add(colors, { id: combination.colorId, label: combination.colorId, sublabel: null });
    add(papers, { id: combination.paperId, label: combination.paperId, sublabel: null });
    add(coverFinishes, {
      id: combination.coverFinishId,
      label: combination.coverFinishId,
      sublabel: null,
    });
  }
  colors.sort((a, b) => a.id.localeCompare(b.id));
  papers.sort((a, b) => a.id.localeCompare(b.id));
  coverFinishes.sort((a, b) => a.id.localeCompare(b.id));

  return {
    source: raw.source,
    retrievedAt: raw.retrieved_at,
    trims,
    bindings,
    colors,
    papers,
    coverFinishes,
    combinations,
  };
}
// ---------------------------------------------------------------------------
// The reactive constraint engine
// ---------------------------------------------------------------------------

function dimensionValue(
  combination: LuluCombination,
  dimension: LuluDimension,
): string {
  switch (dimension) {
    case "trim":
      return combination.trimId;
    case "binding":
      return combination.bindingId;
    case "color":
      return combination.colorId;
    case "paper":
      return combination.paperId;
    case "coverFinish":
      return combination.coverFinishId;
  }
}

function selectedValue(
  selection: LuluSelection,
  dimension: LuluDimension,
): string | null {
  switch (dimension) {
    case "trim":
      return selection.trimId;
    case "binding":
      return selection.bindingId;
    case "color":
      return selection.colorId;
    case "paper":
      return selection.paperId;
    case "coverFinish":
      return selection.coverFinishId;
  }
}

const ALL_DIMENSIONS: LuluDimension[] = [
  "trim",
  "binding",
  "color",
  "paper",
  "coverFinish",
];

/**
 * Combinations still reachable from the current selection, optionally ignoring
 * one dimension (so an option can be judged against everything ELSE the user
 * has chosen) and optionally ignoring the page count.
 */
export function reachableCombinations(
  catalog: LuluCatalog,
  selection: LuluSelection,
  options: { ignore?: LuluDimension; ignorePages?: boolean } = {},
): LuluCombination[] {
  return catalog.combinations.filter((combination) => {
    for (const dimension of ALL_DIMENSIONS) {
      if (dimension === options.ignore) continue;
      const chosen = selectedValue(selection, dimension);
      if (chosen !== null && dimensionValue(combination, dimension) !== chosen) {
        return false;
      }
    }
    if (!options.ignorePages && selection.pageCount !== null) {
      if (!pageCountFits(combination, selection.pageCount)) return false;
    }
    return true;
  });
}

export function pageCountFits(
  combination: LuluCombination,
  pageCount: number,
): boolean {
  if (combination.minPages !== null && pageCount < combination.minPages) {
    return false;
  }
  if (combination.maxPages !== null && pageCount > combination.maxPages) {
    return false;
  }
  return true;
}

/** The live MIN–MAX page window for everything selected so far. */
export function pageWindowFor(
  catalog: LuluCatalog,
  selection: LuluSelection,
): PageWindow {
  const candidates = reachableCombinations(catalog, selection, {
    ignorePages: true,
  });
  let min: number | null = null;
  let max: number | null = null;
  for (const combination of candidates) {
    if (combination.minPages !== null) {
      min = min === null ? combination.minPages : Math.min(min, combination.minPages);
    }
    if (combination.maxPages !== null) {
      max = max === null ? combination.maxPages : Math.max(max, combination.maxPages);
    }
  }
  return { min, max };
}

function describeWindow(window: PageWindow): string | null {
  if (window.min !== null && window.max !== null) {
    return `${window.min}–${window.max} pages`;
  }
  if (window.min !== null) return `${window.min}+ pages`;
  if (window.max !== null) return `up to ${window.max} pages`;
  return null;
}

/**
 * Judge one option inside one dimension against the rest of the selection.
 * A disabled option always carries WHY — the page count or the combination.
 */
export function availabilityFor(
  catalog: LuluCatalog,
  selection: LuluSelection,
  dimension: LuluDimension,
  optionId: string,
): OptionAvailability {
  const probe: LuluSelection = { ...selection };
  const withOption = { ...probe, ...applyDimension(dimension, optionId) };

  const withPages = reachableCombinations(catalog, withOption);
  if (withPages.length > 0) return { available: true, reason: null };

  const ignoringPages = reachableCombinations(catalog, withOption, {
    ignorePages: true,
  });
  if (ignoringPages.length > 0 && selection.pageCount !== null) {
    let min: number | null = null;
    let max: number | null = null;
    for (const combination of ignoringPages) {
      if (combination.minPages !== null) {
        min = min === null ? combination.minPages : Math.min(min, combination.minPages);
      }
      if (combination.maxPages !== null) {
        max = max === null ? combination.maxPages : Math.max(max, combination.maxPages);
      }
    }
    const window = describeWindow({ min, max });
    return {
      available: false,
      reason: window
        ? `Not available at ${selection.pageCount} pages (${window})`
        : `Not available at ${selection.pageCount} pages`,
    };
  }

  return {
    available: false,
    reason: "Not available with the options selected",
  };
}

function applyDimension(
  dimension: LuluDimension,
  optionId: string,
): Partial<LuluSelection> {
  switch (dimension) {
    case "trim":
      return { trimId: optionId };
    case "binding":
      return { bindingId: optionId };
    case "color":
      return { colorId: optionId };
    case "paper":
      return { paperId: optionId };
    case "coverFinish":
      return { coverFinishId: optionId };
  }
}

export function selectionPatch(
  dimension: LuluDimension,
  optionId: string,
): Partial<LuluSelection> {
  return applyDimension(dimension, optionId);
}

/** The single matching combination, or null while the selection is ambiguous. */
export function resolveCombination(
  catalog: LuluCatalog,
  selection: LuluSelection,
): LuluCombination | null {
  if (
    selection.trimId === null ||
    selection.bindingId === null ||
    selection.colorId === null ||
    selection.paperId === null ||
    selection.coverFinishId === null ||
    selection.pageCount === null
  ) {
    return null;
  }
  const matches = reachableCombinations(catalog, selection);
  return matches[0] ?? null;
}

/**
 * Least-destructive order for giving up a chosen option: the most downstream
 * decision goes first, so changing a binding never costs you the trim size.
 */
const PRUNE_ORDER: LuluDimension[] = [
  "coverFinish",
  "paper",
  "color",
  "binding",
  "trim",
];

/**
 * Drop the FEWEST already-chosen options needed to reach a combination the
 * catalog actually contains — never the whole configuration.
 *
 * Page count is deliberately ignored here: an out-of-range page count disables
 * options with a reason and flags the field, exactly like Lulu's calculator.
 * It must never silently destroy a configuration the user just built.
 */
export function pruneInvalidSelections(
  catalog: LuluCatalog,
  selection: LuluSelection,
  /** The dimension the user just set — never cleared by its own change. */
  protectedDimension?: LuluDimension,
): LuluSelection {
  let next = selection;
  if (reachableCombinations(catalog, next, { ignorePages: true }).length > 0) {
    return next;
  }
  for (const dimension of PRUNE_ORDER) {
    if (dimension === protectedDimension) continue;
    if (selectedValue(next, dimension) === null) continue;
    next = { ...next, ...clearDimension(dimension) };
    if (reachableCombinations(catalog, next, { ignorePages: true }).length > 0) {
      return next;
    }
  }
  return next;
}

function clearDimension(dimension: LuluDimension): Partial<LuluSelection> {
  switch (dimension) {
    case "trim":
      return { trimId: null };
    case "binding":
      return { bindingId: null };
    case "color":
      return { colorId: null };
    case "paper":
      return { paperId: null };
    case "coverFinish":
      return { coverFinishId: null };
  }
}

export const EMPTY_SELECTION: LuluSelection = {
  trimId: null,
  bindingId: null,
  colorId: null,
  paperId: null,
  coverFinishId: null,
  pageCount: null,
};
