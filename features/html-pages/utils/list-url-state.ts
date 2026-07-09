/**
 * URL + session state for the published HTML pages list.
 * Keeps view mode, filters, infinite-scroll depth, and scroll position
 * so returning from an editor lands on the same place.
 */

export type HtmlPagesViewMode = "table" | "grid";
export type HtmlPagesSortField =
  "meta_title" | "updated_at" | "created_at" | "is_indexable";
export type HtmlPagesSortDir = "asc" | "desc";

export interface HtmlPagesListState {
  view: HtmlPagesViewMode;
  q: string;
  indexableOnly: boolean;
  sort: HtmlPagesSortField;
  dir: HtmlPagesSortDir;
  /** How many grid items are currently revealed (infinite scroll). */
  n: number;
}

export const HTML_PAGES_GRID_COLS = 4;
/** Three rows at xl (4 cols). */
export const HTML_PAGES_GRID_ROW_BATCH = HTML_PAGES_GRID_COLS * 3;
export const HTML_PAGES_GRID_INITIAL = HTML_PAGES_GRID_ROW_BATCH;

const SCROLL_KEY = "html-pages:list-scroll";
const RET_KEY = "html-pages:list-ret";

const SORT_FIELDS = new Set<HtmlPagesSortField>([
  "meta_title",
  "updated_at",
  "created_at",
  "is_indexable",
]);

export function parseHtmlPagesListState(
  params: URLSearchParams,
): HtmlPagesListState {
  const viewRaw = params.get("view");
  const view: HtmlPagesViewMode = viewRaw === "grid" ? "grid" : "table";
  const sortRaw = params.get("sort");
  const sort: HtmlPagesSortField = SORT_FIELDS.has(
    sortRaw as HtmlPagesSortField,
  )
    ? (sortRaw as HtmlPagesSortField)
    : "updated_at";
  const dirRaw = params.get("dir");
  const dir: HtmlPagesSortDir = dirRaw === "asc" ? "asc" : "desc";
  const nRaw = Number(params.get("n"));
  const n =
    Number.isFinite(nRaw) && nRaw > 0
      ? Math.max(HTML_PAGES_GRID_INITIAL, Math.floor(nRaw))
      : HTML_PAGES_GRID_INITIAL;

  return {
    view,
    q: params.get("q") ?? "",
    indexableOnly: params.get("ix") === "1",
    sort,
    dir,
    n,
  };
}

export function htmlPagesListStateToSearchParams(
  state: HtmlPagesListState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view !== "table") params.set("view", state.view);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.indexableOnly) params.set("ix", "1");
  if (state.sort !== "updated_at") params.set("sort", state.sort);
  if (state.dir !== "desc") params.set("dir", state.dir);
  if (state.view === "grid" && state.n > HTML_PAGES_GRID_INITIAL) {
    params.set("n", String(state.n));
  }
  return params;
}

export function htmlPagesListHref(state: HtmlPagesListState): string {
  const qs = htmlPagesListStateToSearchParams(state).toString();
  return qs ? `/cms/html-pages?${qs}` : "/cms/html-pages";
}

export function saveHtmlPagesListScroll(scrollTop: number): void {
  try {
    sessionStorage.setItem(
      SCROLL_KEY,
      String(Math.max(0, Math.round(scrollTop))),
    );
  } catch {
    // ignore
  }
}

export function consumeHtmlPagesListScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw == null) return null;
    sessionStorage.removeItem(SCROLL_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** Persist the list query string so the editor back button can restore it. */
export function saveHtmlPagesListReturn(search: string): void {
  try {
    sessionStorage.setItem(RET_KEY, search);
  } catch {
    // ignore
  }
}

export function readHtmlPagesListReturn(): string {
  try {
    return sessionStorage.getItem(RET_KEY) ?? "";
  } catch {
    return "";
  }
}

export function htmlPagesListHrefFromReturn(
  ret: string | null | undefined,
): string {
  if (!ret) {
    const saved = readHtmlPagesListReturn();
    return saved ? `/cms/html-pages?${saved}` : "/cms/html-pages";
  }
  return `/cms/html-pages?${ret}`;
}
