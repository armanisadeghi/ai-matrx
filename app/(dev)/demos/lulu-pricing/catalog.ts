/**
 * Tolerant reader + reactive constraint engine for the Lulu catalog.
 *
 * The catalog is ingested server-side from Lulu's machine-readable Product
 * Spec Sheet, so the exact inner shape of `GET /lulu/catalog` may still move.
 * Everything here reads `unknown` and accepts a spread of plausible key names
 * rather than asserting one. NOTHING about the product matrix is hardcoded:
 * the option lists, the page windows, and every availability verdict are
 * derived from the combinations the server sends.
 */

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

// ---------------------------------------------------------------------------
// Primitive readers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** First key present on the record whose value reads as a non-empty string. */
function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function readNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Read a nested option reference: `{ binding: "PB" }`, `{ binding: { id: … } }`,
 * or `{ binding_id: … }` all resolve to the same id.
 */
function readRef(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    const nested = asRecord(value);
    if (nested) {
      const id = readString(nested, "id", "code", "key", "value", "slug");
      if (id) return id;
      continue;
    }
    const direct = readString(record, key);
    if (direct) return direct;
  }
  return null;
}

/** Find the first array-valued alias, at the root or one level into a wrapper. */
function locateArray(root: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const direct = root[key];
    if (Array.isArray(direct)) return direct;
  }
  for (const wrapper of ["catalog", "data", "options", "product", "products"]) {
    const nested = asRecord(root[wrapper]);
    if (!nested) continue;
    for (const key of keys) {
      const value = nested[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

const IN_TO_MM = 25.4;

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Option readers
// ---------------------------------------------------------------------------

function readOption(raw: unknown): LuluOption | null {
  const record = asRecord(raw);
  if (!record) {
    // A bare string list is a legitimate minimal shape.
    if (typeof raw === "string" && raw.trim().length > 0) {
      return { id: raw.trim(), label: raw.trim(), sublabel: null };
    }
    return null;
  }
  const id = readString(record, "id", "code", "key", "value", "slug", "name");
  if (!id) return null;
  return {
    id,
    label: readString(record, "name", "label", "title", "display_name") ?? id,
    sublabel: readString(record, "description", "sublabel", "detail", "note"),
  };
}

function readTrim(raw: unknown): LuluTrimOption | null {
  const base = readOption(raw);
  if (!base) return null;
  const record = asRecord(raw);
  if (!record) {
    return {
      ...base,
      widthIn: null,
      heightIn: null,
      widthMm: null,
      heightMm: null,
    };
  }

  const widthIn = readNumber(record, "width_in", "width_inches", "width");
  const heightIn = readNumber(record, "height_in", "height_inches", "height");
  const widthMm =
    readNumber(record, "width_mm", "width_millimeters") ??
    (widthIn === null ? null : roundTo(widthIn * IN_TO_MM, 0));
  const heightMm =
    readNumber(record, "height_mm", "height_millimeters") ??
    (heightIn === null ? null : roundTo(heightIn * IN_TO_MM, 0));

  const measurement =
    widthIn !== null && heightIn !== null
      ? `${roundTo(widthIn, 3)} × ${roundTo(heightIn, 3)} in${
          widthMm !== null && heightMm !== null
            ? ` · ${widthMm} × ${heightMm} mm`
            : ""
        }`
      : null;

  return {
    ...base,
    sublabel: measurement ?? base.sublabel,
    widthIn,
    heightIn,
    widthMm,
    heightMm,
  };
}

const HARDCOVER_HINTS = ["hard", "case", "linen", "cw", "lw"];

function classifyBinding(record: Record<string, unknown> | null, option: LuluOption): LuluBindingGroup {
  const declared = record
    ? readString(record, "group", "binding_group", "cover_type", "category")
    : null;
  if (declared) {
    const normalized = declared.toLowerCase();
    if (normalized.includes("hard") || normalized.includes("case")) {
      return "hardcover";
    }
    if (normalized.includes("soft") || normalized.includes("paper")) {
      return "paperback";
    }
  }
  const haystack = `${option.id} ${option.label}`.toLowerCase();
  return HARDCOVER_HINTS.some((hint) =>
    new RegExp(`\\b${hint}\\b`).test(haystack) || haystack.includes(hint),
  )
    ? "hardcover"
    : "paperback";
}

function readBinding(raw: unknown): LuluBindingOption | null {
  const base = readOption(raw);
  if (!base) return null;
  return { ...base, group: classifyBinding(asRecord(raw), base) };
}

// ---------------------------------------------------------------------------
// Combinations
// ---------------------------------------------------------------------------

function readCombination(raw: unknown): LuluCombination | null {
  const record = asRecord(raw);
  if (!record) return null;

  const trimId = readRef(record, "trim_id", "trim", "trim_size", "trim_size_id", "size");
  const bindingId = readRef(record, "binding_id", "binding", "binding_type", "bind");
  const colorId = readRef(
    record,
    "color_id",
    "interior_color_id",
    "interior_color",
    "color",
    "ink",
  );
  const paperId = readRef(record, "paper_id", "paper", "paper_type", "interior_paper");
  const coverFinishId = readRef(
    record,
    "cover_finish_id",
    "cover_finish",
    "finish",
    "lamination",
  );

  if (!trimId || !bindingId || !colorId || !paperId || !coverFinishId) return null;

  return {
    trimId,
    bindingId,
    colorId,
    paperId,
    coverFinishId,
    minPages: readNumber(record, "min_pages", "page_count_min", "min_page_count", "pages_min"),
    maxPages: readNumber(record, "max_pages", "page_count_max", "max_page_count", "pages_max"),
    podPackageId: readString(record, "pod_package_id", "package_id", "sku", "id"),
  };
}

const EMPTY_CATALOG: LuluCatalog = {
  source: null,
  retrievedAt: null,
  trims: [],
  bindings: [],
  colors: [],
  papers: [],
  coverFinishes: [],
  combinations: [],
};

/** Build the option list for a dimension, falling back to what combinations reference. */
function withDerivedOptions<T extends LuluOption>(
  declared: T[],
  combinations: LuluCombination[],
  pick: (combination: LuluCombination) => string,
  make: (id: string) => T,
): T[] {
  const byId = new Map<string, T>();
  for (const option of declared) byId.set(option.id, option);
  for (const combination of combinations) {
    const id = pick(combination);
    if (!byId.has(id)) byId.set(id, make(id));
  }
  return [...byId.values()];
}

export function readCatalog(raw: unknown): LuluCatalog {
  const root = asRecord(raw);
  if (!root) return EMPTY_CATALOG;

  const combinations = locateArray(root, [
    "combinations",
    "products",
    "packages",
    "skus",
    "variants",
    "product_combinations",
  ])
    .map(readCombination)
    .filter((entry): entry is LuluCombination => entry !== null);

  const trims = withDerivedOptions(
    locateArray(root, ["trims", "trim_sizes", "sizes"])
      .map(readTrim)
      .filter((entry): entry is LuluTrimOption => entry !== null),
    combinations,
    (combination) => combination.trimId,
    (id) => ({
      id,
      label: id,
      sublabel: null,
      widthIn: null,
      heightIn: null,
      widthMm: null,
      heightMm: null,
    }),
  );

  const bindings = withDerivedOptions(
    locateArray(root, ["bindings", "binding_types", "binds"])
      .map(readBinding)
      .filter((entry): entry is LuluBindingOption => entry !== null),
    combinations,
    (combination) => combination.bindingId,
    (id) => ({
      id,
      label: id,
      sublabel: null,
      group: classifyBinding(null, { id, label: id, sublabel: null }),
    }),
  );

  const simple = (keys: string[], pick: (c: LuluCombination) => string) =>
    withDerivedOptions(
      locateArray(root, keys)
        .map(readOption)
        .filter((entry): entry is LuluOption => entry !== null),
      combinations,
      pick,
      (id) => ({ id, label: id, sublabel: null }),
    );

  return {
    source: readString(root, "source"),
    retrievedAt: readString(root, "retrieved_at", "retrievedAt", "updated_at"),
    trims,
    bindings,
    colors: simple(
      ["colors", "interior_colors", "inks", "color_options"],
      (combination) => combination.colorId,
    ),
    papers: simple(
      ["papers", "paper_types", "interior_papers"],
      (combination) => combination.paperId,
    ),
    coverFinishes: simple(
      ["cover_finishes", "finishes", "laminations"],
      (combination) => combination.coverFinishId,
    ),
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
 * Drop any already-chosen option that the latest change invalidated, so the UI
 * never sits on a combination the catalog does not contain.
 */
export function pruneInvalidSelections(
  catalog: LuluCatalog,
  selection: LuluSelection,
  /** The dimension the user just set — never cleared by its own change. */
  protectedDimension?: LuluDimension,
): LuluSelection {
  let next = selection;
  for (const dimension of ALL_DIMENSIONS) {
    if (dimension === protectedDimension) continue;
    const chosen = selectedValue(next, dimension);
    if (chosen === null) continue;
    const cleared: LuluSelection = { ...next, ...clearDimension(dimension) };
    const verdict = availabilityFor(catalog, cleared, dimension, chosen);
    if (!verdict.available) next = cleared;
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
