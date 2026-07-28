"use client";

// features/crm/components/CrmListPage.tsx
//
// The /crm entry list — People and Companies, table-first, built on the
// canonical entity-list primitives proven at /agents/all:
//   * MatrxDataTable in CONTROLLED mode (sort/filter/paging are server ops
//     over the whole result set, served by fetchPartyPage via PostgREST)
//   * BrowseScopeTabs — THE VIEW LAW made visible (Mine / My Orgs / Public
//     with true server counts; "shared" joins when crm grows a grant reader)
//   * useListViewPrefs — style persists (sort, page size, density);
//     query (search, filters, page, scope) deliberately does not
//   * ONE "…" menu per row carrying every record action

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { MoreVertical, Plus, UserPlus, Building2, Contact } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  ColumnFiltersState,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { BrowseScopeTabs } from "@/features/agents/browse/components/BrowseScopeTabs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import { cn } from "@/lib/utils";
import { usePartyList } from "../hooks/usePartyList";
import { deleteParty } from "../service";
import type {
  DateBucket,
  PartyKind,
  PartyListFilters,
  PartyListRow,
} from "../types";
import { CRM_LIST_SCOPES, DATE_BUCKETS } from "../types";
import { PARTY_COLUMNS } from "./columns";
import { NewPartyDialog } from "./NewPartyDialog";

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

export function CrmListPage() {
  const router = useRouter();
  const { prefs, setPrefs } = useListViewPrefs(SURFACE_KEY, SURFACE_DEFAULTS);

  const sortOpts = useMemo(
    () => ({
      sort: prefs.sort,
      direction: prefs.direction,
      pageSize: prefs.pageSize,
    }),
    [prefs.sort, prefs.direction, prefs.pageSize],
  );

  const list = usePartyList(sortOpts);
  // New records land in the active org (falls back to the personal org while
  // none is explicitly selected). Access never depends on it — only stamping.
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const [newOpen, setNewOpen] = useState(false);
  const [newKind, setNewKind] = useState<PartyKind>("person");

  const openRow = (row: PartyListRow) => router.push(`/crm/${row.id}`);

  const menuFor = (row: PartyListRow): (() => ItemMenuConfig) => {
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

  const newButtons = (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => {
          setNewKind("organization");
          setNewOpen(true);
        }}
      >
        <Building2 className="h-3.5 w-3.5" />
        New company
      </Button>
      <Button
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => {
          setNewKind("person");
          setNewOpen(true);
        }}
      >
        <UserPlus className="h-3.5 w-3.5" />
        New person
      </Button>
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Static interactive chrome must clear the glass header; only the list
          body scrolls behind it. Never a hardcoded pt-12. */}
      <div className="shrink-0 px-3 pt-[calc(var(--shell-header-h)+0.375rem)]">
        <div className="flex flex-wrap items-center gap-2">
          <BrowseScopeTabs
            scope={list.query.scope}
            scopes={CRM_LIST_SCOPES}
            counts={list.counts}
            onChange={(scope) => list.setQuery({ scope })}
          />
          <div className="ml-auto">{newButtons}</div>
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
            searchPlaceholder: "Search name, company, domain, title…",
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
          emptyState={{
            icon: <Plus className="h-5 w-5" />,
            title: "No records here",
            description:
              "Nothing matches this scope and filter combination. Create the first one.",
            action: newButtons,
          }}
        />
      </div>

      <NewPartyDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        orgId={
          list.query.scope.kind === "orgs" && list.query.scope.organizationId
            ? list.query.scope.organizationId
            : effectiveOrgId
        }
        defaultKind={newKind}
        onCreated={list.refresh}
      />
    </div>
  );
}
