"use client";

// features/crm/components/CrmListPage.tsx
//
// The /crm entry list — People and Companies, table-first, built on the
// canonical entity-list primitives proven at /agents/all:
//   * MatrxDataTable in CONTROLLED mode (sort/filter/paging are server ops
//     over the whole result set, served by fetchPartyPage via PostgREST)
//   * EntityScopeTabs (lib/entity-list) — THE VIEW LAW made visible (Mine / My Orgs / Public
//     with true server counts; "shared" joins when crm grows a grant reader)
//   * useListViewPrefs — style persists (sort, page size, density);
//     query (search, filters, page, scope) deliberately does not
//   * ONE "…" menu per row carrying every record action

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import {
  MoreVertical,
  Plus,
  UserPlus,
  Building2,
  Contact,
  Trash2,
  ArchiveRestore,
  FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  ColumnFiltersState,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { EntityScopeTabs } from "@/lib/entity-list/components/EntityScopeTabs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import { cn } from "@/lib/utils";
import { usePartyList } from "../hooks/usePartyList";
import { deleteParty, purgeParty, restoreParty } from "../service";
import type {
  DateBucket,
  PartyKind,
  PartyKindFilter,
  PartyListFilters,
  PartyListRow,
  PartySortDirection,
  PartySortKey,
} from "../types";
import {
  CRM_LIST_SCOPES,
  DATE_BUCKETS,
  DATE_BUCKET_ENUM_TEXT,
  DATE_BUCKET_VALUES,
  PARTY_COLUMN_FILTER_KEYS,
  PARTY_COLUMN_FILTER_KEY_ENUM_TEXT,
  PARTY_KINDS,
  PARTY_KIND_ENUM_TEXT,
  PARTY_KIND_FILTERS,
  PARTY_KIND_FILTER_ENUM_TEXT,
  PARTY_SORT_DIRECTIONS,
  PARTY_SORT_DIRECTION_ENUM_TEXT,
  PARTY_SORT_KEYS,
  PARTY_SORT_KEY_ENUM_TEXT,
  PARTY_TEXT_FILTER_KEYS,
} from "../types";
import { PARTY_COLUMNS } from "./columns";
import { useOpenCrmCreatePartyWindow } from "@/features/overlays/openers/crmCreatePartyWindow";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  CRM_SURFACE_NAME,
  createCrmScope,
} from "@/features/surfaces/manifests/crm.manifest";

const SURFACE_KEY = "crm-parties";
const SURFACE_DEFAULTS = {
  version: 1,
  sort: "updated_at",
  direction: "desc" as const,
};

const BUCKET_VALUES = DATE_BUCKETS.map((b) => b.value as string);

/** Table `columnFilters` → the service's typed filter bag. */
function fromTableFilters(state: ColumnFiltersState): PartyListFilters {
  const out: PartyListFilters = {};
  for (const [id, f] of Object.entries(state)) {
    if (!f) continue;
    if (f.kind === "text" && f.value?.trim()) {
      if (id === "display_name") out.display_name = f.value.trim();
      else if (id === "job_title") out.job_title = f.value.trim();
      else if (id === "primary_domain") out.primary_domain = f.value.trim();
    } else if (f.kind === "select") {
      const values = f.values?.length ? f.values : f.value ? [f.value] : [];
      if (values.length === 0) continue;
      if (id === "party_kind") {
        out.party_kind = values.filter(
          (v): v is PartyKind => v === "person" || v === "organization",
        );
      } else if (id === "updated_at" || id === "created_at") {
        const bucket = values.find((v) => BUCKET_VALUES.includes(v));
        if (bucket) out[id] = bucket as DateBucket;
      }
    } else if (f.kind === "boolean" && id === "do_not_contact") {
      out.do_not_contact = f.value;
    }
  }
  return out;
}

/** The service bag → the table's controlled `columnFilters` shape. */
function toTableFilters(filters: PartyListFilters): ColumnFiltersState {
  const out: ColumnFiltersState = {};
  if (filters.display_name)
    out.display_name = { kind: "text", value: filters.display_name };
  if (filters.job_title)
    out.job_title = { kind: "text", value: filters.job_title };
  if (filters.primary_domain)
    out.primary_domain = { kind: "text", value: filters.primary_domain };
  if (filters.party_kind?.length)
    out.party_kind = {
      kind: "select",
      value: filters.party_kind[0],
      values: filters.party_kind,
    };
  if (filters.do_not_contact !== undefined)
    out.do_not_contact = { kind: "boolean", value: filters.do_not_contact };
  if (filters.updated_at)
    out.updated_at = { kind: "select", value: filters.updated_at };
  if (filters.created_at)
    out.created_at = { kind: "select", value: filters.created_at };
  return out;
}

// ── Surface write-target parsers (manifest `writeTargets`) ──────────────────
//
// Validation for the four agent-writable targets on `matrx-user/crm` (and, by
// re-export, `matrx-user/crm-manager`). Every parser VALIDATES THE WHOLE VALUE
// AND THROWS before anything mutates: the writeback seam turns a throw into a
// safe error envelope the agent reads and can correct from, which beats a
// silent coercion that leaves the user staring at a list they did not ask for.
//
// Every vocabulary check reads the SAME constants `crm.manifest.ts`
// interpolates into the descriptions the model is shown, so the contract the
// agent reads and the contract enforced here cannot drift.

/** A type name for an error message, distinguishing null/array from object. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * An object argument from an agent.
 *
 * The inline-tool layer parses a JSON-looking argument before a handler ever
 * sees it, so a well-formed call arrives as a real object. A model that
 * double-encodes sends the JSON *string* instead — tolerating that explicitly
 * is cheaper than letting it fail, read the error, and escape even harder.
 */
function parseObjectArg(
  target: string,
  value: unknown,
): Record<string, unknown> {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new Error(
        `${target} expects an object — received a string that is not valid JSON. Send the object itself, not a JSON-encoded string.`,
      );
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `${target} expects an object — received ${describeValue(raw)}.`,
    );
  }
  return raw as Record<string, unknown>;
}

/**
 * `column_filters` — the WHOLE per-column filter bag, replacing what is set.
 *
 * Unknown keys are rejected rather than dropped: an agent that misspells
 * `name` for `display_name` would otherwise watch its filter silently do
 * nothing, which is a worse outcome than being told. Blank text and an empty
 * `party_kind` array mean "no filter on that column" — the same normalisation
 * `fromTableFilters` applies to what the user types, so an agent write and a
 * user click produce the identical bag.
 */
function parseColumnFilters(value: unknown): PartyListFilters {
  const raw = parseObjectArg("column_filters", value);

  const unknown = Object.keys(raw).filter(
    (key) => !(PARTY_COLUMN_FILTER_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    throw new Error(
      `column_filters rejected: unrecognised key(s) ${unknown.join(", ")}. ` +
        `The filters were left unchanged. Allowed keys are ${PARTY_COLUMN_FILTER_KEY_ENUM_TEXT} — send {} to clear every column filter.`,
    );
  }

  const out: PartyListFilters = {};

  for (const key of PARTY_TEXT_FILTER_KEYS) {
    if (!(key in raw)) continue;
    const entry = raw[key];
    if (typeof entry !== "string") {
      throw new Error(
        `column_filters.${key} expects a string matched as a case-insensitive substring (send "" or omit the key for no filter) — received ${describeValue(entry)}.`,
      );
    }
    const trimmed = entry.trim();
    if (trimmed) out[key] = trimmed;
  }

  if ("party_kind" in raw) {
    const entry = raw.party_kind;
    if (!Array.isArray(entry)) {
      throw new Error(
        `column_filters.party_kind expects an array of record kinds (${PARTY_KIND_ENUM_TEXT}); send [] or omit the key for no filter — received ${describeValue(entry)}.`,
      );
    }
    const kinds = entry.map((item, index) => {
      if (
        typeof item !== "string" ||
        !(PARTY_KINDS as readonly string[]).includes(item)
      ) {
        throw new Error(
          `column_filters.party_kind entry ${index} is not a record kind — expected one of ${PARTY_KIND_ENUM_TEXT}, received ${JSON.stringify(item)}.`,
        );
      }
      return item as PartyKind;
    });
    // A kind twice is the same filter, not a different one.
    const deduped = Array.from(new Set(kinds));
    if (deduped.length > 0) out.party_kind = deduped;
  }

  if ("do_not_contact" in raw) {
    const entry = raw.do_not_contact;
    // Booleans arrive parsed; tolerate the exact "true"/"false" strings a
    // double-encoding model produces, and reject anything else rather than
    // guessing at truthiness.
    const next =
      typeof entry === "boolean"
        ? entry
        : entry === "true"
          ? true
          : entry === "false"
            ? false
            : null;
    if (next === null) {
      throw new Error(
        `column_filters.do_not_contact expects a boolean (true lists only records flagged do-not-contact; omit the key for no filter) — received ${describeValue(entry)}.`,
      );
    }
    out.do_not_contact = next;
  }

  for (const key of ["updated_at", "created_at"] as const) {
    if (!(key in raw)) continue;
    const entry = raw[key];
    if (
      typeof entry !== "string" ||
      !(DATE_BUCKET_VALUES as readonly string[]).includes(entry)
    ) {
      throw new Error(
        `column_filters.${key} expects one relative bucket — ${DATE_BUCKET_ENUM_TEXT} — received ${JSON.stringify(entry)}. Omit the key for no filter; an absolute date is not supported here.`,
      );
    }
    out[key] = entry as DateBucket;
  }

  return out;
}

/**
 * `list_sort` — `{ key?, direction? }`, each half optional.
 *
 * `current` MUST be read at apply time, not at handler-resolve time:
 * `applySurfaceWrite` captures the handler closure BEFORE awaiting the confirm
 * dialog, so a partial write that folded in a value off the render closure
 * would silently reinstate whatever the sort was when the agent asked, undoing
 * a header click the user made while the dialog was open.
 */
function parseListSort(
  value: unknown,
  current: { sort: string; direction: PartySortDirection },
): { sort: PartySortKey | string; direction: PartySortDirection } {
  const raw = parseObjectArg("list_sort", value);

  const unknown = Object.keys(raw).filter(
    (key) => key !== "key" && key !== "direction",
  );
  if (unknown.length > 0) {
    throw new Error(
      `list_sort rejected: unrecognised key(s) ${unknown.join(", ")}. The sort was left unchanged. Send {"key": …} and/or {"direction": …}.`,
    );
  }
  if (!("key" in raw) && !("direction" in raw)) {
    throw new Error(
      `list_sort needs at least one of key (${PARTY_SORT_KEY_ENUM_TEXT}) or direction (${PARTY_SORT_DIRECTION_ENUM_TEXT}) — received an empty object.`,
    );
  }

  let sort = current.sort;
  if ("key" in raw) {
    const entry = raw.key;
    if (
      typeof entry !== "string" ||
      !(PARTY_SORT_KEYS as readonly string[]).includes(entry)
    ) {
      throw new Error(
        `list_sort.key expects one of ${PARTY_SORT_KEY_ENUM_TEXT} — received ${JSON.stringify(entry)}. These are database columns; Employer is a joined embed and cannot be sorted on.`,
      );
    }
    sort = entry;
  }

  let direction = current.direction;
  if ("direction" in raw) {
    const entry = raw.direction;
    if (
      typeof entry !== "string" ||
      !(PARTY_SORT_DIRECTIONS as readonly string[]).includes(entry)
    ) {
      throw new Error(
        `list_sort.direction expects ${PARTY_SORT_DIRECTION_ENUM_TEXT} — received ${JSON.stringify(entry)}.`,
      );
    }
    direction = entry as PartySortDirection;
  }

  return { sort, direction };
}

export interface CrmListPageProps {
  presentation?: "route" | "window";
  surfaceName?: string;
}

export function CrmListPage({
  presentation = "route",
  surfaceName = CRM_SURFACE_NAME,
}: CrmListPageProps) {
  const router = useRouter();
  const openCreateParty = useOpenCrmCreatePartyWindow();
  const { prefs, setPrefs } = useListViewPrefs(SURFACE_KEY, SURFACE_DEFAULTS);

  const list = usePartyList({
    sort: prefs.sort,
    direction: prefs.direction,
    pageSize: prefs.pageSize,
  });
  // New records land in the active org (falls back to the personal org while
  // none is explicitly selected). Access never depends on it — only stamping.
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const openRow = (row: PartyListRow) => router.push(`/crm/${row.id}`);

  const inTrash = list.query.view === "trash";

  const menuFor = (row: PartyListRow): (() => ItemMenuConfig) => {
    if (inTrash) {
      return () => ({
        sections: [
          {
            id: "trash",
            items: [
              {
                id: "restore",
                label: "Restore",
                onSelect: async () => {
                  try {
                    await restoreParty(row.id);
                    list.removeRow(row.id);
                    // The row is removed from THIS list on restore, so the
                    // record it just restored becomes unreachable from here.
                    toast.success(`${row.display_name} restored`, {
                      action: toastDoor("party", row.id),
                    });
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Restore failed",
                    );
                  }
                },
              },
            ],
          },
          {
            id: "danger",
            items: [
              {
                id: "purge",
                label: "Delete permanently",
                tone: "destructive",
                onSelect: async () => {
                  const ok = await confirm({
                    title: `Permanently delete ${row.display_name}?`,
                    description:
                      "This erases the record, its history, notes and pins. It cannot be undone.",
                    confirmLabel: "Delete permanently",
                    variant: "destructive",
                  });
                  if (!ok) return;
                  try {
                    await purgeParty(row.id);
                    list.removeRow(row.id);
                    toast.success(`${row.display_name} permanently deleted`);
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Delete failed",
                    );
                  }
                },
              },
            ],
          },
        ],
      });
    }
    return () => ({
      sections: [
        {
          id: "open",
          items: [
            { id: "open", kind: "link", label: "Open", href: `/crm/${row.id}` },
            {
              id: "copy-link",
              label: "Copy link",
              onSelect: () =>
                navigator.clipboard.writeText(
                  `${window.location.origin}/crm/${row.id}`,
                ),
              toast: {
                loading: "Copying…",
                success: "Link copied",
              },
            },
            {
              id: "copy-id",
              label: "Copy ID",
              onSelect: () => navigator.clipboard.writeText(row.id),
              toast: { loading: "Copying…", success: "ID copied" },
            },
          ],
        },
        {
          id: "danger",
          items: [
            {
              id: "delete",
              label: "Delete",
              tone: "destructive",
              onSelect: async () => {
                const ok = await confirm({
                  title: `Delete ${row.display_name}?`,
                  description:
                    "The record moves to trash. Contact history is kept.",
                  confirmLabel: "Delete",
                  variant: "destructive",
                });
                if (!ok) return;
                try {
                  await deleteParty(row.id);
                  list.removeRow(row.id);
                  toast.success(`${row.display_name} deleted`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                }
              },
            },
          ],
        },
      ],
    });
  };

  const onTableState = (next: MatrxDataTableQueryState) => {
    const nextSort = next.sort?.id ?? prefs.sort;
    const nextDir = next.sort?.direction ?? prefs.direction;
    if (nextSort !== prefs.sort || nextDir !== prefs.direction) {
      setPrefs({ sort: nextSort, direction: nextDir });
    }
    if (next.pageSize !== prefs.pageSize) setPrefs({ pageSize: next.pageSize });
    list.setQuery({
      page: next.page,
      search: next.search,
      filters: fromTableFilters(next.columnFilters),
    });
  };

  // ── Write half of the CRM list surface (manifest `writeTargets`) ──────────
  //
  // Four targets, all `mode:"ui"` / `applyPolicy:"ask"`, registered here on
  // the provider this component already mounts — it owns every piece of state
  // they touch, so no `useSurfaceWriteHandlers` child seam is needed. Both
  // mounts (the /crm route and CrmManagerWindow) run this same component, so
  // both get the same handlers; `crm-manager.manifest.ts` re-exports the
  // target array to match. See the WRITE DOCTRINE block in `crm.manifest.ts`.
  //
  // Each handler lands through the EXACT setter the human control calls:
  // `list.setQuery` for search / kind facet / column filters (the same call
  // `onTableState` makes from the toolbar and the column popovers) and
  // `setPrefs` for the sort (the same call a column-header click makes). No
  // parallel write path exists.

  // `applySurfaceWrite` captures the handler closure BEFORE it awaits the
  // confirm dialog, so anything a handler READS off this render is stale by
  // the time Apply is pressed. Only `list_sort` reads current state (the
  // other three replace wholesale) — it reads it through this ref.
  const sortRef = useRef({ sort: prefs.sort, direction: prefs.direction });
  sortRef.current = { sort: prefs.sort, direction: prefs.direction };

  const buildCrmWriteHandlers = () => ({
    search_query: (value: unknown) => {
      if (typeof value !== "string") {
        throw new Error(
          `search_query expects a plain string, not JSON and not JSON-encoded (pass "" to clear the search) — received ${describeValue(value)}.`,
        );
      }
      list.setQuery({ search: value });
    },
    party_kind_filter: (value: unknown) => {
      if (
        typeof value !== "string" ||
        !(PARTY_KIND_FILTERS as readonly string[]).includes(value)
      ) {
        throw new Error(
          `party_kind_filter expects exactly one of ${PARTY_KIND_FILTER_ENUM_TEXT} — received ${JSON.stringify(value)}. The facet was left unchanged.`,
        );
      }
      list.setQuery({ kind: value as PartyKindFilter });
    },
    column_filters: (value: unknown) => {
      list.setQuery({ filters: parseColumnFilters(value) });
    },
    list_sort: (value: unknown) => {
      setPrefs(parseListSort(value, sortRef.current));
    },
  });

  const newButtons = (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-11 gap-1 px-2 text-xs lg:h-7"
        asChild
      >
        {/* Window mounts keep their state: the wizard opens in a new tab. */}
        <Link
          href="/crm/import"
          target={presentation === "route" ? undefined : "_blank"}
        >
          <FileUp className="h-3.5 w-3.5" />
          Import
        </Link>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-11 gap-1 px-2 text-xs lg:h-7"
        onClick={() => {
          openCreateParty({
            initialKind: "organization",
            initialOrgId:
              list.query.scope.kind === "orgs" &&
              list.query.scope.organizationId
                ? list.query.scope.organizationId
                : effectiveOrgId,
          });
        }}
      >
        <Building2 className="h-3.5 w-3.5" />
        New company
      </Button>
      <Button
        size="sm"
        className="h-11 gap-1 px-2 text-xs lg:h-7"
        onClick={() => {
          openCreateParty({
            initialKind: "person",
            initialOrgId:
              list.query.scope.kind === "orgs" &&
              list.query.scope.organizationId
                ? list.query.scope.organizationId
                : effectiveOrgId,
          });
        }}
      >
        <UserPlus className="h-3.5 w-3.5" />
        New person
      </Button>
    </div>
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={surfaceName}
      getScope={() =>
        createCrmScope({
          scope_kind: list.query.scope.kind,
          selected_organization_id:
            list.query.scope.kind === "orgs"
              ? (list.query.scope.organizationId ?? undefined)
              : undefined,
          search_query: list.query.search,
          party_kind_filter: list.query.kind,
          column_filters: list.query.filters,
          sort_key: prefs.sort,
          sort_direction: prefs.direction,
          page_number: list.query.page,
          page_size: prefs.pageSize,
          visible_records: list.rows,
          visible_record_ids: list.rows.map((row) => row.id),
          visible_record_count: list.rows.length,
          total_record_count: list.total,
          scope_counts: list.counts,
          available_organizations: Object.entries(list.ctx?.orgNames ?? {}).map(
            ([id, name]) => ({ id, name }),
          ),
          is_loading: list.isLoading || list.isFetching,
          load_error: list.error ?? undefined,
        })
      }
      getWriteHandlers={buildCrmWriteHandlers}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {/* Static interactive chrome must clear the glass header; only the list
            body scrolls behind it. Never a hardcoded pt-12. */}
        <div
          className={cn(
            "shrink-0 px-3",
            presentation === "route"
              ? "pt-[calc(var(--shell-header-h)+0.375rem)]"
              : "pt-2",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="[&_button]:h-11 [&_button]:min-w-11 lg:[&_button]:h-7 lg:[&_button]:min-w-0">
              <EntityScopeTabs
                scope={list.query.scope}
                scopes={CRM_LIST_SCOPES}
                counts={list.counts}
                onChange={(scope) => list.setQuery({ scope })}
              />
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                variant={inTrash ? "secondary" : "ghost"}
                className="h-11 gap-1 px-2 text-xs lg:h-7"
                onClick={() =>
                  list.setQuery({ view: inTrash ? "active" : "trash" })
                }
              >
                {inTrash ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {inTrash ? "Back to records" : "Trash"}
              </Button>
              {!inTrash && newButtons}
            </div>
          </div>
          {list.error && (
            <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
              {list.error}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 px-3 pb-2 pt-2">
          <MatrxDataTable<PartyListRow>
            data={list.rows}
            columns={PARTY_COLUMNS}
            getRowId={(row) => row.id}
            isLoading={list.isLoading}
            isFetching={list.isFetching}
            zebra
            pageSizeOptions={[...LIST_VIEW_PAGE_SIZES]}
            className={cn(
              prefs.density === "compact" && "text-xs [&_td]:py-1 [&_th]:py-1",
            )}
            query={{
              mode: "controlled",
              totalItems: list.total,
              state: {
                page: list.query.page,
                pageSize: prefs.pageSize,
                search: list.query.search,
                anyOf: "",
                columnFilters: toTableFilters(list.query.filters),
                sort: { id: prefs.sort, direction: prefs.direction },
              },
              onStateChange: onTableState,
            }}
            toolbar={{
              search: true,
              searchPlaceholder: "Search CRM records…",
              facets: [
                {
                  type: "button-group",
                  id: "kind",
                  value: list.query.kind,
                  defaultValue: "all",
                  options: [
                    { value: "all", label: "All" },
                    {
                      value: "person",
                      label: "People",
                      icon: <Contact className="h-3.5 w-3.5" />,
                    },
                    {
                      value: "organization",
                      label: "Companies",
                      icon: <Building2 className="h-3.5 w-3.5" />,
                    },
                  ],
                  onChange: (value) => {
                    if (
                      value === "all" ||
                      value === "person" ||
                      value === "organization"
                    ) {
                      list.setQuery({ kind: value });
                    }
                  },
                },
              ],
            }}
            // Row click opens the record; the "…" menu is the ONE row affordance.
            detail={{ enabled: false }}
            window={{ enabled: false }}
            onRowOpen={openRow}
            rowActions={(row) => (
              <ItemMenu config={menuFor(row)} align="end">
                <button
                  type="button"
                  aria-label={`Actions for ${row.display_name}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </ItemMenu>
            )}
            copy={{
              label: "CRM record",
              listLabel: "CRM records",
              location: "/crm",
              rowKind: "crm-party",
              listKind: "crm-party-list",
              humanRow: (row) =>
                `${row.display_name} (${row.party_kind === "person" ? "person" : "company"})${row.job_title ? ` — ${row.job_title}` : ""}${row.employer ? ` @ ${row.employer.display_name}` : ""}`,
              showRow: false,
              showToolbar: false,
            }}
            emptyState={
              inTrash
                ? {
                    icon: <Trash2 className="h-5 w-5" />,
                    title: "Trash is empty",
                    description:
                      "Deleted records land here and can be restored or permanently deleted.",
                  }
                : {
                    icon: <Plus className="h-5 w-5" />,
                    title: "No records here",
                    description:
                      "Nothing matches this scope and filter combination. Create the first one.",
                    action: newButtons,
                  }
            }
          />
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
