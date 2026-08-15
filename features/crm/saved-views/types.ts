// features/crm/saved-views/types.ts
//
// A SMART VIEW is a named, re-runnable /crm party-list query — the thing that
// turns the list from a browser into a work queue ("Untouched leads in Acme",
// "Companies with no phone", "Owed a callback today"). It stores QUERY, which
// `lib/list-views` deliberately never persists, plus the STYLE axis a view
// implies (sort), and nothing else.
//
// The row shape derives from the generated `types/database.types.ts`; the
// definition is jsonb, so it is VALIDATED on read here — a stale or
// hand-edited blob resolves to the default query instead of throwing a list
// page away.

import type { Database } from "@/types/database.types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import type {
  DateBucket,
  ExpertStatusFilter,
  PartyKind,
  PartyKindFilter,
  PartyListFilters,
  PartyListQuery,
  PartySortDirection,
  PartySortKey,
  RecordClassFilter,
} from "../types";
import {
  DATE_BUCKET_VALUES,
  DEFAULT_RECORD_CLASS_FILTER,
  EXPERT_STATUS_FILTERS,
  RECORD_CLASS_FILTERS,
  RECORD_CLASS_FILTER_LABEL,
  DEFAULT_PARTY_QUERY,
  PARTY_COLUMN_FILTER_KEYS,
  PARTY_KINDS,
  PARTY_KIND_FILTERS,
  PARTY_SORT_DIRECTIONS,
  PARTY_SORT_KEYS,
  PARTY_TEXT_FILTER_KEYS,
} from "../types";

export type SavedViewRow = Database["crm"]["Tables"]["saved_view"]["Row"];
export type SavedViewInsert = Database["crm"]["Tables"]["saved_view"]["Insert"];
export type SavedViewUpdate = Database["crm"]["Tables"]["saved_view"]["Update"];

/** Platform visibility values a smart view uses (the sharing control). */
export const SAVED_VIEW_VISIBILITIES = ["personal", "internal"] as const;
export type SavedViewVisibility = (typeof SAVED_VIEW_VISIBILITIES)[number];

/**
 * The persisted query. `version` is the shape version — bump it when the
 * definition gains or loses a field, and teach `parseSavedViewDefinition` how
 * to read the older shapes (same discipline as `ListViewPrefs.version`).
 *
 * The trash view is deliberately NOT part of a definition: a saved view is a
 * work queue over live records, never over deleted ones.
 */
export const SAVED_VIEW_DEFINITION_VERSION = 1;

/**
 * The scopes a smart view may be saved against. Deliberately narrower than
 * `ListScopeKind`: `parseSavedViewDefinition` only ever emits these three, so
 * the type says what the parser actually guarantees and `queryFromDefinition`
 * can rebuild a complete `ListScope` without inventing a missing `industryId`.
 */
export type SavedViewScopeKind = Extract<
  ListScopeKind,
  "mine" | "orgs" | "public"
>;

export interface SavedViewDefinition {
  version: number;
  scopeKind: SavedViewScopeKind;
  /** Only meaningful for the `orgs` scope: narrowed to one org, or all mine. */
  organizationId: string | null;
  search: string;
  kind: PartyKindFilter;
  filters: PartyListFilters;
  sort: PartySortKey;
  direction: PartySortDirection;
}

/** A view row with its definition already validated — the only shape the UI sees. */
export interface SavedView extends SavedViewRow {
  definition: SavedViewDefinition;
}

const DEFAULT_DEFINITION: SavedViewDefinition = {
  version: SAVED_VIEW_DEFINITION_VERSION,
  scopeKind: "mine",
  organizationId: null,
  search: "",
  kind: "all",
  filters: {},
  sort: "updated_at",
  direction: "desc",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Keep only filter keys the list can actually serve, with the right shapes. */
function parseFilters(raw: unknown): PartyListFilters {
  if (!isRecord(raw)) return {};
  const out: PartyListFilters = {};
  for (const key of Object.keys(raw)) {
    if (!(PARTY_COLUMN_FILTER_KEYS as readonly string[]).includes(key)) continue;
    const value = raw[key];
    if ((PARTY_TEXT_FILTER_KEYS as readonly string[]).includes(key)) {
      if (typeof value === "string" && value.trim()) {
        out[key as (typeof PARTY_TEXT_FILTER_KEYS)[number]] = value.trim();
      }
    } else if (key === "party_kind") {
      if (!Array.isArray(value)) continue;
      const kinds = value.filter((v): v is PartyKind =>
        (PARTY_KINDS as readonly string[]).includes(v as string),
      );
      if (kinds.length) out.party_kind = Array.from(new Set(kinds));
    } else if (key === "do_not_contact") {
      if (typeof value === "boolean") out.do_not_contact = value;
    } else if (key === "expert_status") {
      if (
        typeof value === "string" &&
        (EXPERT_STATUS_FILTERS as readonly string[]).includes(value)
      ) {
        out.expert_status = value as ExpertStatusFilter;
      }
    } else if (key === "record_class") {
      // A saved view is a named QUERY, and the record facet is part of it — a
      // view built over what the platform discovered has to reopen that way.
      // Dropping it here also blinded the dirty-detector (definitionFromQuery
      // runs through this parser), so changing the facet read as "unmodified".
      if (
        typeof value === "string" &&
        (RECORD_CLASS_FILTERS as readonly string[]).includes(value)
      ) {
        out.record_class = value as RecordClassFilter;
      }
    } else if (key === "updated_at" || key === "created_at") {
      if (
        typeof value === "string" &&
        (DATE_BUCKET_VALUES as readonly string[]).includes(value)
      ) {
        out[key] = value as DateBucket;
      }
    }
  }
  return out;
}

/**
 * Read a stored definition defensively. Anything unrecognised falls back to the
 * default for that field — a smart view whose blob drifted still opens, showing
 * a list the user can see and re-save, instead of erroring on a page they only
 * wanted to browse.
 */
export function parseSavedViewDefinition(raw: unknown): SavedViewDefinition {
  if (!isRecord(raw)) return { ...DEFAULT_DEFINITION };
  const scopeKind =
    raw.scopeKind === "mine" ||
    raw.scopeKind === "orgs" ||
    raw.scopeKind === "public"
      ? raw.scopeKind
      : DEFAULT_DEFINITION.scopeKind;
  return {
    version: SAVED_VIEW_DEFINITION_VERSION,
    scopeKind,
    organizationId:
      scopeKind === "orgs" && typeof raw.organizationId === "string"
        ? raw.organizationId
        : null,
    search: typeof raw.search === "string" ? raw.search : "",
    kind:
      typeof raw.kind === "string" &&
      (PARTY_KIND_FILTERS as readonly string[]).includes(raw.kind)
        ? (raw.kind as PartyKindFilter)
        : "all",
    filters: parseFilters(raw.filters),
    sort:
      typeof raw.sort === "string" &&
      (PARTY_SORT_KEYS as readonly string[]).includes(raw.sort)
        ? (raw.sort as PartySortKey)
        : DEFAULT_DEFINITION.sort,
    direction:
      typeof raw.direction === "string" &&
      (PARTY_SORT_DIRECTIONS as readonly string[]).includes(raw.direction)
        ? (raw.direction as PartySortDirection)
        : DEFAULT_DEFINITION.direction,
  };
}

/** Capture what the list is showing RIGHT NOW as a definition. */
export function definitionFromQuery(
  query: PartyListQuery,
  sort: { sort: string; direction: PartySortDirection },
): SavedViewDefinition {
  return parseSavedViewDefinition({
    version: SAVED_VIEW_DEFINITION_VERSION,
    scopeKind: query.scope.kind,
    organizationId:
      query.scope.kind === "orgs" ? (query.scope.organizationId ?? null) : null,
    search: query.search,
    kind: query.kind,
    filters: query.filters,
    sort: sort.sort,
    direction: sort.direction,
  });
}

/**
 * A definition → the list query it describes. Always `view: "active"` and
 * `page: 1`: a smart view is a queue of live records, opened at the top.
 */
export function queryFromDefinition(
  definition: SavedViewDefinition,
): PartyListQuery {
  return {
    ...DEFAULT_PARTY_QUERY,
    scope:
      definition.scopeKind === "orgs"
        ? { kind: "orgs", organizationId: definition.organizationId ?? null }
        : { kind: definition.scopeKind },
    search: definition.search,
    kind: definition.kind,
    filters: definition.filters,
    page: 1,
    view: "active",
  };
}

/**
 * Does the list currently show exactly this view? Compared on the normalized
 * definition so key order, blank strings and an empty filter bag can never
 * report "modified" when nothing is.
 */
export function definitionsMatch(
  a: SavedViewDefinition,
  b: SavedViewDefinition,
): boolean {
  return stableKey(a) === stableKey(b);
}

function stableKey(definition: SavedViewDefinition): string {
  const filters = Object.entries(definition.filters)
    .filter(([, v]) => v !== undefined)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]);
  return JSON.stringify([
    definition.scopeKind,
    definition.organizationId,
    definition.search.trim(),
    definition.kind,
    filters,
    definition.sort,
    definition.direction,
  ]);
}

/** Human summary of what a view narrows to — shown on the chip and in menus. */
export function describeDefinition(definition: SavedViewDefinition): string {
  const parts: string[] = [];
  parts.push(
    definition.scopeKind === "mine"
      ? "My records"
      : definition.scopeKind === "public"
        ? "Public records"
        : definition.organizationId
          ? "One organization"
          : "My organizations",
  );
  if (definition.kind !== "all") {
    parts.push(definition.kind === "person" ? "People" : "Companies");
  }
  if (definition.search.trim()) parts.push(`matching "${definition.search.trim()}"`);
  const f = definition.filters;
  if (f.display_name) parts.push(`name ~ ${f.display_name}`);
  if (f.job_title) parts.push(`title ~ ${f.job_title}`);
  if (f.primary_domain) parts.push(`domain ~ ${f.primary_domain}`);
  if (f.party_kind?.length) parts.push(`kind: ${f.party_kind.join(", ")}`);
  if (f.do_not_contact !== undefined) {
    parts.push(f.do_not_contact ? "do-not-contact only" : "contactable only");
  }
  if (f.expert_status) parts.push(`experts: ${f.expert_status}`);
  // Stated only when it is NOT the default — a view that says "My contacts" on
  // every chip teaches the user nothing; one that says "Everything" warns them.
  if (f.record_class && f.record_class !== DEFAULT_RECORD_CLASS_FILTER) {
    parts.push(RECORD_CLASS_FILTER_LABEL[f.record_class]);
  }
  if (f.updated_at) parts.push(`updated ${f.updated_at}`);
  if (f.created_at) parts.push(`created ${f.created_at}`);
  return parts.join(" · ");
}
