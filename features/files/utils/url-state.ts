/**
 * features/files/utils/url-state.ts
 *
 * Bidirectional URL ↔ UI-state codec for the `/files` route family.
 *
 * The shape of the URL we emit (everything is opt-in — defaults are
 * NEVER serialised so a "fresh" view stays at a clean `/files` URL):
 *
 *   /files/<folder/path...>?
 *     view=grid                        (omit when "list")
 *     sort=name                        (omit when "updated_at" — the default)
 *     dir=asc                          (omit when "desc" — the default)
 *     kind=files                       (omit when "all")
 *     details=extended                 (omit when "compact")
 *     chip=recents                     (omit when null)
 *     q=<search>                       (omit when empty)
 *     file=<id>                        (omit when no preview is open)
 *     cf.name=<text>
 *     cf.type=image,video              (multi-select; comma joined)
 *     cf.ext=<text>
 *     cf.mime=<text>
 *     cf.path=<text>
 *     cf.owner=uid1,uid2
 *     cf.modified=week                 (omit when "any")
 *     cf.created=today                 (omit when "any")
 *     cf.size=large                    (omit when "any")
 *     cf.access=shared                 (omit when "any")
 *     cf.rag=indexed,not_indexed
 *     cols=name,type,owner             (omit when matches DEFAULT_VISIBLE_COLUMNS)
 *
 * The folder PATH lives in the URL pathname, not the query string — the
 * existing `/files/[[...path]]` route already resolves it server-side
 * via `cld_folders.folder_path`. The codec here only handles the query
 * string + an optional `?file=<id>` for the active preview.
 *
 * Used by:
 *   - server-side route pages: parse `searchParams` once and pass an
 *     `initialUiPatch` + `initialFileId` into `<PageShell/>` so the
 *     first paint matches the URL.
 *   - the client-side `<FilesUrlSync/>` component: serialises the
 *     current Redux UI state into the URL via `router.replace` after
 *     every user-driven state change.
 */

import {
  DEFAULT_VISIBLE_COLUMNS,
  type AccessFilter,
  type ChipFilter,
  type ColumnFilters,
  type ColumnId,
  type DetailsLevel,
  type KindFilter,
  type ModifiedFilter,
  type OwnerFilter,
  type RagFilter,
  type RagStatus,
  type SizeFilter,
  type SortBy,
  type SortDirection,
  type TypeFilter,
  type UiState,
  type ViewMode,
  type VisibleColumns,
} from "@/features/files/types";

// ---------------------------------------------------------------------------
// Param name registry — single source of truth for the URL contract.
// Keeping these as constants prevents typos and lets the type system
// drive the parser.
// ---------------------------------------------------------------------------

const PARAM = {
  view: "view",
  sort: "sort",
  dir: "dir",
  kind: "kind",
  details: "details",
  chip: "chip",
  q: "q",
  file: "file",
  cols: "cols",
  // Column filters — namespaced with `cf.` so future top-level params
  // can be added without colliding.
  cfName: "cf.name",
  cfType: "cf.type",
  cfExt: "cf.ext",
  cfMime: "cf.mime",
  cfPath: "cf.path",
  cfOwner: "cf.owner",
  cfModified: "cf.modified",
  cfCreated: "cf.created",
  cfSize: "cf.size",
  cfAccess: "cf.access",
  cfRag: "cf.rag",
} as const;

// ---------------------------------------------------------------------------
// Allowed value sets (parser uses these to reject garbage)
// ---------------------------------------------------------------------------

const VIEW_VALUES = new Set<ViewMode>(["list", "grid", "columns"]);
const SORT_VALUES = new Set<SortBy>([
  "name",
  "type",
  "extension",
  "mime",
  "path",
  "owner",
  "size",
  "version",
  "updated_at",
  "created_at",
]);
const DIR_VALUES = new Set<SortDirection>(["asc", "desc"]);
const KIND_VALUES = new Set<KindFilter>(["all", "files", "folders"]);
const DETAILS_VALUES = new Set<DetailsLevel>(["compact", "extended"]);
const CHIP_VALUES = new Set<ChipFilter>(["recents", "starred"]);
const MODIFIED_VALUES = new Set<ModifiedFilter>([
  "any",
  "today",
  "week",
  "month",
]);
const SIZE_VALUES = new Set<SizeFilter>([
  "any",
  "small",
  "medium",
  "large",
  "huge",
]);
const ACCESS_VALUES = new Set<AccessFilter>([
  "any",
  "private",
  "shared",
  "public",
]);
const RAG_VALUES = new Set<RagStatus>([
  "indexed",
  "not_indexed",
  "pending",
  "unknown",
]);
const COLUMN_IDS = new Set<ColumnId>([
  "name",
  "type",
  "extension",
  "mime",
  "path",
  "owner",
  "size",
  "version",
  "updated_at",
  "created_at",
  "access",
  "context",
  "rag_status",
]);

// ---------------------------------------------------------------------------
// SERIALIZE — Redux UI → URLSearchParams
// ---------------------------------------------------------------------------

/**
 * State the URL needs to round-trip. Pulled from `UiState`, plus the
 * active file id which we want in the URL even though it lives on the
 * same slice.
 */
export interface SerializableUiState {
  viewMode: ViewMode;
  sortBy: SortBy;
  sortDir: SortDirection;
  kindFilter: KindFilter;
  detailsLevel: DetailsLevel;
  searchQuery: string;
  chipFilter: ChipFilter | null;
  activeFileId: string | null;
  columnFilters: ColumnFilters;
  visibleColumns: VisibleColumns;
}

/**
 * Build a query string from current UI state. Defaults are omitted so
 * the URL stays as short as possible. Returns a fresh URLSearchParams —
 * caller is responsible for merging with any non-files params already
 * on the URL (we don't touch them).
 */
export function serializeUiToParams(ui: SerializableUiState): URLSearchParams {
  const params = new URLSearchParams();

  if (ui.viewMode !== "list") params.set(PARAM.view, ui.viewMode);
  // Default sort is `updated_at desc` (newest first) — omit it so a fresh
  // view stays at a clean `/files` URL. Any other sort/dir is serialized.
  if (ui.sortBy !== "updated_at") params.set(PARAM.sort, ui.sortBy);
  if (ui.sortDir !== "desc") params.set(PARAM.dir, ui.sortDir);
  if (ui.kindFilter !== "all") params.set(PARAM.kind, ui.kindFilter);
  if (ui.detailsLevel !== "compact") {
    params.set(PARAM.details, ui.detailsLevel);
  }
  if (ui.chipFilter !== null) params.set(PARAM.chip, ui.chipFilter);
  if (ui.searchQuery.trim().length > 0) {
    params.set(PARAM.q, ui.searchQuery);
  }
  if (ui.activeFileId) params.set(PARAM.file, ui.activeFileId);

  // Column filters — only emit when set away from default.
  const cf = ui.columnFilters;
  if (cf.name) params.set(PARAM.cfName, cf.name);
  if (cf.type.length > 0) params.set(PARAM.cfType, cf.type.join(","));
  if (cf.extension) params.set(PARAM.cfExt, cf.extension);
  if (cf.mime) params.set(PARAM.cfMime, cf.mime);
  if (cf.path) params.set(PARAM.cfPath, cf.path);
  if (cf.owner.length > 0) params.set(PARAM.cfOwner, cf.owner.join(","));
  if (cf.modified !== "any") params.set(PARAM.cfModified, cf.modified);
  if (cf.created !== "any") params.set(PARAM.cfCreated, cf.created);
  if (cf.size !== "any") params.set(PARAM.cfSize, cf.size);
  if (cf.access !== "any") params.set(PARAM.cfAccess, cf.access);
  if (cf.rag.length > 0) params.set(PARAM.cfRag, cf.rag.join(","));

  // Visible columns — only emit when the set differs from defaults.
  if (!isDefaultVisibleColumns(ui.visibleColumns)) {
    const visible = (Object.keys(ui.visibleColumns) as ColumnId[])
      .filter((c) => ui.visibleColumns[c])
      .sort();
    params.set(PARAM.cols, visible.join(","));
  }

  return params;
}

function isDefaultVisibleColumns(vc: VisibleColumns): boolean {
  for (const col of Object.keys(DEFAULT_VISIBLE_COLUMNS) as ColumnId[]) {
    if (vc[col] !== DEFAULT_VISIBLE_COLUMNS[col]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// PARSE — query string → Partial<UiState> (safe for setUiBatch)
// ---------------------------------------------------------------------------

/**
 * Result of parsing the URL query. Always partial — only the fields
 * that were explicitly present (and validated) appear in the patch.
 * `activeFileId` is split out because the Redux action that owns it
 * (`setActiveFileId`) lives on a different code path than `setUiBatch`.
 */
export interface ParsedUrlState {
  uiPatch: Partial<UiState>;
  activeFileId: string | null;
}

type SearchParamsLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function getParam(params: SearchParamsLike, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const raw = params[key];
  if (raw === undefined) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

/**
 * Parse a URLSearchParams (client side) or a Next.js `searchParams`
 * record (server side) into a Partial<UiState> ready to feed into the
 * `setUiBatch` reducer.
 *
 * Unknown / invalid values are silently dropped. We deliberately do
 * NOT throw — a malformed URL should land the user on the cleanest
 * possible "all defaults" view, not a runtime error.
 */
export function parseParamsToUiPatch(params: SearchParamsLike): ParsedUrlState {
  const uiPatch: Partial<UiState> = {};

  const view = getParam(params, PARAM.view);
  if (view && VIEW_VALUES.has(view as ViewMode)) {
    uiPatch.viewMode = view as ViewMode;
  }

  const sort = getParam(params, PARAM.sort);
  if (sort && SORT_VALUES.has(sort as SortBy)) {
    uiPatch.sortBy = sort as SortBy;
  }

  const dir = getParam(params, PARAM.dir);
  if (dir && DIR_VALUES.has(dir as SortDirection)) {
    uiPatch.sortDir = dir as SortDirection;
  }

  const kind = getParam(params, PARAM.kind);
  if (kind && KIND_VALUES.has(kind as KindFilter)) {
    uiPatch.kindFilter = kind as KindFilter;
  }

  const details = getParam(params, PARAM.details);
  if (details && DETAILS_VALUES.has(details as DetailsLevel)) {
    uiPatch.detailsLevel = details as DetailsLevel;
  }

  const chip = getParam(params, PARAM.chip);
  if (chip && CHIP_VALUES.has(chip as ChipFilter)) {
    uiPatch.chipFilter = chip as ChipFilter;
  }

  const q = getParam(params, PARAM.q);
  if (q !== null) uiPatch.searchQuery = q;

  // Column filters
  const columnFilters: Partial<ColumnFilters> = {};

  const cfName = getParam(params, PARAM.cfName);
  if (cfName !== null) columnFilters.name = cfName;

  const cfType = getParam(params, PARAM.cfType);
  if (cfType !== null && cfType.length > 0) {
    columnFilters.type = splitCsv(cfType) as TypeFilter;
  }

  const cfExt = getParam(params, PARAM.cfExt);
  if (cfExt !== null) columnFilters.extension = cfExt;

  const cfMime = getParam(params, PARAM.cfMime);
  if (cfMime !== null) columnFilters.mime = cfMime;

  const cfPath = getParam(params, PARAM.cfPath);
  if (cfPath !== null) columnFilters.path = cfPath;

  const cfOwner = getParam(params, PARAM.cfOwner);
  if (cfOwner !== null && cfOwner.length > 0) {
    columnFilters.owner = splitCsv(cfOwner) as OwnerFilter;
  }

  const cfModified = getParam(params, PARAM.cfModified);
  if (cfModified && MODIFIED_VALUES.has(cfModified as ModifiedFilter)) {
    columnFilters.modified = cfModified as ModifiedFilter;
  }

  const cfCreated = getParam(params, PARAM.cfCreated);
  if (cfCreated && MODIFIED_VALUES.has(cfCreated as ModifiedFilter)) {
    columnFilters.created = cfCreated as ModifiedFilter;
  }

  const cfSize = getParam(params, PARAM.cfSize);
  if (cfSize && SIZE_VALUES.has(cfSize as SizeFilter)) {
    columnFilters.size = cfSize as SizeFilter;
  }

  const cfAccess = getParam(params, PARAM.cfAccess);
  if (cfAccess && ACCESS_VALUES.has(cfAccess as AccessFilter)) {
    columnFilters.access = cfAccess as AccessFilter;
  }

  const cfRag = getParam(params, PARAM.cfRag);
  if (cfRag !== null && cfRag.length > 0) {
    const validated = splitCsv(cfRag).filter((s) =>
      RAG_VALUES.has(s as RagStatus),
    );
    if (validated.length > 0) {
      columnFilters.rag = validated as RagFilter;
    }
  }

  if (Object.keys(columnFilters).length > 0) {
    uiPatch.columnFilters = columnFilters as ColumnFilters;
  }

  // Visible columns — comma-separated list of currently-visible columns.
  const cols = getParam(params, PARAM.cols);
  if (cols !== null && cols.length > 0) {
    const requested = new Set(splitCsv(cols));
    const next = {} as VisibleColumns;
    for (const col of Object.keys(DEFAULT_VISIBLE_COLUMNS) as ColumnId[]) {
      next[col] = requested.has(col);
    }
    next.name = true; // never hideable
    uiPatch.visibleColumns = next;
  }

  const file = getParam(params, PARAM.file);
  const activeFileId = file && file.length > 0 ? file : null;

  return { uiPatch, activeFileId };
}

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Compare — used by the URL-sync component to decide whether to write
// ---------------------------------------------------------------------------

/**
 * True when two query strings are equivalent under our codec — i.e. the
 * same set of params, each with the same value. Order doesn't matter.
 * Used by the sync layer to skip no-op `router.replace` calls.
 */
export function paramsEqual(a: URLSearchParams, b: URLSearchParams): boolean {
  if (countParams(a) !== countParams(b)) return false;
  for (const [k, v] of a.entries()) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

function countParams(p: URLSearchParams): number {
  let n = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _ of p.keys()) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Folder path encoding — keep in sync with the catch-all route.
// ---------------------------------------------------------------------------

/**
 * Encode a logical folder path (`"Reports/2026 Q1"`) into URL path
 * segments suitable for `router.push("/files/<segments>")`. Each
 * segment is `encodeURIComponent`'d so spaces and unicode survive the
 * round-trip; the catch-all route reverses this with `decodeURIComponent`.
 *
 * Returns `""` (empty string) for null / empty paths so callers can
 * concat directly with `/files`.
 */
export function encodeFolderPathSegments(folderPath: string | null): string {
  if (!folderPath) return "";
  return folderPath
    .split("/")
    .filter((s) => s.length > 0)
    .map(encodeURIComponent)
    .join("/");
}
