// features/education/library/librarySurface.ts
//
// The `matrx-user/education-library` surface for /education/library: what the
// list shows (read from the SAME controller the list renders — never a fetch;
// getScope is polled every 400ms) and the one write, `library_view`, which
// narrows or re-sorts the list through the list's own query/view setters.
//
// Not loaded = the key is OMITTED; loaded and empty = [] / 0. A failed load
// reports library_state "failed" + library_error only.

import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import type { EntityFilters, EntityListQuery } from "@/lib/entity-list/types";
import { NONE_VALUE } from "@/lib/entity-list/types";
import { makeScope } from "@/lib/list-scope/types";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  EDUCATION_LIBRARY_SORT_FIELDS,
  EDUCATION_LIBRARY_SURFACE_NAME,
  EDUCATION_LIBRARY_TABS,
  createEducationLibraryScope,
  type EducationLibraryFullRow,
  type EducationLibraryListRow,
} from "@/features/surfaces/manifests/education-library.manifest";
import {
  educationLibraryHref,
  libraryRowStats,
  type EducationLibraryRow,
} from "./types";

type LibraryList = EntityListSurfaceController<EducationLibraryRow>;

/** The first N rows go inline (INLINE_TIER.list). */
export const LIBRARY_LIST_INLINE_ROWS = 25;

const KINDS = ["fc_set", "assessment", "study_media", "note"] as const;

function pct(accuracy: number | null): number | null {
  return accuracy == null ? null : Math.round(accuracy * 100);
}

function text(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/**
 * One condensed row. Sized so 25 rows fit INLINE_TIER.list (4000 chars): the
 * kind is implied by the format, and a field with nothing to say is OMITTED
 * (no card count, never studied, owned by the person) rather than sent null.
 */
export function toLibraryListRow(
  row: EducationLibraryRow,
): EducationLibraryListRow {
  const stats = libraryRowStats(row);
  const accuracy = pct(stats.accuracy);
  return {
    id: row.id,
    title: row.title.length > 60 ? `${row.title.slice(0, 59)}…` : row.title,
    format: text(row.subtype) ?? row.kind,
    ...(stats.itemCount != null ? { items: stats.itemCount } : {}),
    ...(stats.dueCount > 0 ? { due: stats.dueCount } : {}),
    ...(accuracy != null ? { accuracy_pct: accuracy } : {}),
    ...(stats.lastStudiedAt
      ? { last_studied: stats.lastStudiedAt.slice(0, 10) }
      : {}),
    ...(row.is_owner ? {} : { mine: false }),
  };
}

/** Stay under INLINE_TIER.list with room for the envelope's own framing. */
const LIBRARY_LIST_CHAR_BUDGET = 3900;

/**
 * The first 25 rows, condensed — fewer only when long rows would push the
 * value past the inline budget (it would then be demoted to a lookup whole).
 */
export function condensedList(
  rows: readonly EducationLibraryRow[],
): EducationLibraryListRow[] {
  const out: EducationLibraryListRow[] = [];
  let size = 2;
  for (const row of rows.slice(0, LIBRARY_LIST_INLINE_ROWS)) {
    const entry = toLibraryListRow(row);
    const add = JSON.stringify(entry).length + 1;
    if (size + add > LIBRARY_LIST_CHAR_BUDGET) break;
    out.push(entry);
    size += add;
  }
  return out;
}

export function toLibraryFullRow(
  row: EducationLibraryRow,
): EducationLibraryFullRow {
  const stats = libraryRowStats(row);
  return {
    id: row.id,
    title: row.title,
    description: text(row.description),
    kind: row.kind,
    format: text(row.subtype),
    status: text(row.status),
    visibility: text(row.visibility),
    mine: row.is_owner,
    access_level: text(row.access_level),
    topic: stats.topic,
    difficulty: stats.difficulty,
    items: stats.itemCount,
    studied: stats.studiedCount,
    accuracy_pct: pct(stats.accuracy),
    due: stats.dueCount,
    last_studied: stats.lastStudiedAt,
    duration_seconds: stats.durationSeconds,
    source_title: stats.sourceTitle,
    organization_name: text(row.organization_name),
    owner_email: text(row.owner_email),
    created_at: row.created_at,
    updated_at: row.updated_at,
    href: educationLibraryHref(row),
  };
}

function compactFilters(
  filters: EntityFilters,
): Record<string, string | string[] | boolean> {
  const out: Record<string, string | string[] | boolean> = {};
  for (const [key, f] of Object.entries(filters)) {
    if (f.kind === "select") {
      if (f.values.length) out[key] = f.values;
    } else if (f.kind === "text") {
      if (f.value.trim()) out[key] = f.value;
    } else out[key] = f.value;
  }
  return out;
}

export function buildEducationLibraryScope(list: LibraryList) {
  const base = {
    active_tab: list.query.scope.kind,
    search_query: list.query.search,
    active_sort: `${list.view.sort} ${list.view.direction}`,
    active_filters: compactFilters(list.query.filters),
    list_page: { page: list.query.page, page_size: list.view.pageSize },
  };
  const counts =
    !list.countsLoading && !list.countsError
      ? {
          tab_counts: {
            mine: list.counts.byKind.mine,
            shared: list.counts.byKind.shared,
            public: list.counts.byKind.public,
          },
        }
      : {};
  const facets =
    !list.facetsLoading && !list.facetsError
      ? { filter_options: list.facets.byKind }
      : {};

  if (list.error)
    return createEducationLibraryScope({
      ...base,
      ...counts,
      ...facets,
      library_state: "failed",
      library_error: list.error.message,
    });
  if (list.isLoading)
    return createEducationLibraryScope({
      ...base,
      ...counts,
      ...facets,
      library_state: "loading",
    });
  return createEducationLibraryScope({
    ...base,
    ...counts,
    ...facets,
    library_state: "ready",
    library_list: condensedList(list.rows),
    library_total: list.total,
    library_rows: list.rows.map(toLibraryFullRow),
  });
}

// ─── library_view ────────────────────────────────────────────────────────────

const VIEW_KEYS = [
  "search_query",
  "tab",
  "kinds",
  "formats",
  "statuses",
  "visibilities",
  "sort_by",
  "sort_direction",
  "page",
] as const;

/** Which filter-panel filter each array key sets (column / facet id). */
const FILTER_FOR = {
  kinds: "kind",
  formats: "subtype",
  statuses: "status",
  visibilities: "visibility",
} as const;

export interface LibraryViewChange {
  search?: string;
  tab?: (typeof EDUCATION_LIBRARY_TABS)[number];
  filters?: Partial<Record<(typeof FILTER_FOR)[keyof typeof FILTER_FOR], string[]>>;
  sort?: string;
  direction?: "asc" | "desc";
  page?: number;
}

/**
 * Read a `library_view` value. Pure; throws a sentence the agent can act on.
 * `vocab` is the filter panel's live options per facet id (kind, subtype,
 * status, visibility); `kind` is always checked against the four types.
 */
export function parseLibraryViewValue(
  value: unknown,
  vocab: Record<string, string[]>,
): LibraryViewChange {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      `library_view must be an object with any of ${VIEW_KEYS.join(", ")}; received ${
        Array.isArray(value) ? "an array" : JSON.stringify(value)
      }.`,
    );
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (k) => !(VIEW_KEYS as readonly string[]).includes(k),
  );
  if (unknownKeys.length)
    throw new Error(
      `library_view does not accept ${unknownKeys.join(", ")}. Allowed keys: ${VIEW_KEYS.join(", ")}.`,
    );
  if (Object.keys(record).length === 0)
    throw new Error("library_view needs at least one key to change.");

  const change: LibraryViewChange = {};
  if ("search_query" in record) {
    if (typeof record.search_query !== "string")
      throw new Error(
        `library_view.search_query must be text ("" clears it); received ${JSON.stringify(record.search_query)}.`,
      );
    change.search = record.search_query.trim();
  }
  if ("tab" in record) {
    const tab = String(record.tab).trim().toLowerCase();
    if (!(EDUCATION_LIBRARY_TABS as readonly string[]).includes(tab))
      throw new Error(
        `library_view.tab must be one of ${EDUCATION_LIBRARY_TABS.join(", ")}; received ${JSON.stringify(record.tab)}.`,
      );
    change.tab = tab as LibraryViewChange["tab"];
  }
  for (const [key, facet] of Object.entries(FILTER_FOR)) {
    if (!(key in record)) continue;
    const raw = record[key];
    if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string"))
      throw new Error(
        `library_view.${key} must be an array of text ([] clears it); received ${JSON.stringify(raw)}.`,
      );
    const allowed =
      facet === "kind" ? [...KINDS] : (vocab[facet] ?? []);
    const values = (raw as string[]).map((v) => v.trim());
    const bad = values.filter((v) => !allowed.includes(v));
    if (bad.length)
      throw new Error(
        `library_view.${key} has ${bad.map((b) => JSON.stringify(b)).join(", ")}, which the library does not offer here. Allowed: ${
          allowed.length ? allowed.join(", ") : "(none in this tab)"
        }.`,
      );
    (change.filters ??= {})[facet] = [...new Set(values)];
  }
  if ("sort_by" in record) {
    const sort = String(record.sort_by).trim();
    if (!(EDUCATION_LIBRARY_SORT_FIELDS as readonly string[]).includes(sort))
      throw new Error(
        `library_view.sort_by must be one of ${EDUCATION_LIBRARY_SORT_FIELDS.join(", ")}; received ${JSON.stringify(record.sort_by)}.`,
      );
    change.sort = sort;
  }
  if ("sort_direction" in record) {
    const dir = String(record.sort_direction).trim().toLowerCase();
    if (dir !== "asc" && dir !== "desc")
      throw new Error(
        `library_view.sort_direction must be "asc" or "desc"; received ${JSON.stringify(record.sort_direction)}.`,
      );
    change.direction = dir;
  }
  if ("page" in record) {
    const page = record.page;
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1)
      throw new Error(
        `library_view.page must be a whole number, 1 or more; received ${JSON.stringify(page)}.`,
      );
    change.page = page;
  }
  return change;
}

function liveVocab(list: LibraryList): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [facet, entries] of Object.entries(list.facets.byKind))
    out[facet] = entries.map((e) => e.value).filter((v) => v !== NONE_VALUE);
  return out;
}

function describeChange(change: LibraryViewChange): string {
  const parts: string[] = [];
  if (change.tab) parts.push(`tab ${change.tab}`);
  if (change.search !== undefined)
    parts.push(change.search ? `search "${change.search}"` : "search cleared");
  for (const [facet, values] of Object.entries(change.filters ?? {}))
    parts.push(values.length ? `${facet} = ${values.join(", ")}` : `${facet} cleared`);
  if (change.sort || change.direction)
    parts.push(`sort ${change.sort ?? "(same field)"} ${change.direction ?? ""}`.trim());
  if (change.page) parts.push(`page ${change.page}`);
  return parts.join("; ");
}

export function buildEducationLibraryWriteHandlers(
  list: LibraryList,
): SurfaceWriteHandlers {
  const parse = (value: unknown) => {
    try {
      return parseLibraryViewValue(value, liveVocab(list));
    } catch (e) {
      return refuseSurfaceWrite((e as Error).message);
    }
  };
  return {
    library_view: {
      validate: (value) => {
        parse(value);
      },
      apply: (value) => {
        const change = parse(value);
        const queryPatch: Partial<EntityListQuery> = {};
        if (change.search !== undefined) queryPatch.search = change.search;
        if (change.tab) queryPatch.scope = makeScope(change.tab);
        if (change.filters) {
          const filters: EntityFilters = { ...list.query.filters };
          for (const [facet, values] of Object.entries(change.filters)) {
            if (!values?.length) delete filters[facet];
            else filters[facet] = { kind: "select", values };
          }
          queryPatch.filters = filters;
        }
        const narrowed = Object.keys(queryPatch).length > 0;
        if (change.page) queryPatch.page = change.page;
        else if (narrowed) queryPatch.page = 1;
        if (Object.keys(queryPatch).length) list.patchQuery(queryPatch);

        const viewPatch: Partial<ListViewPrefs> = {};
        if (change.sort) viewPatch.sort = change.sort;
        if (change.direction) viewPatch.direction = change.direction;
        if (Object.keys(viewPatch).length) list.patchView(viewPatch);

        return {
          summary: `Library view changed: ${describeChange(change)}. The list reloads now; the values you were given describe the view before this change.`,
        };
      },
    },
  };
}

/** The descriptor `EntityListPage` takes as `surface`. */
export const EDUCATION_LIBRARY_SURFACE = {
  surfaceName: EDUCATION_LIBRARY_SURFACE_NAME,
  getScope: buildEducationLibraryScope,
  getWriteHandlers: buildEducationLibraryWriteHandlers,
};
