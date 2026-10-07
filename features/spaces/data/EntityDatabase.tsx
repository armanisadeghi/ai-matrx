"use client";

// features/spaces/data/EntityDatabase.tsx — a database block over a built-in module (F10): tasks,
// projects, deals, employees — `{kind: "entity", token}` read through the drill doors AS THE PERSON.
//
// The store answers which rows a person sees; this block only asks a question of it (a filter, a
// sort) and draws the answer: table (the one data table), board (records-ui's embedded `TablePage` over
// the source — cards move between groups), chart (`EntityChartBlock`, bare, total in the donut's middle),
// a side / center / full-page peek whose writable properties save through the module's own write door.
// "New" adds a row where the module allows it (task, project); every other module refuses in its words.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Input, Switch } from "@ai-matrx/design-system/controls";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { EntityChartBlock, RecordsMount, TablePage, type ChartKind, type EntityColumn, type EntityRow } from "@ai-matrx/records-ui";
import type { RecordsConfig } from "@ai-matrx/records";
import { useRecordsClient } from "@ai-matrx/records/react";
import { ArrowDownUp, ArrowUpRight, Database, Kanban, PieChart, List, ListFilter, Maximize2, PanelRight, Plus, Search, SlidersHorizontal, Square, Table2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { ensureOrganizationForWrite } from "@/lib/organization/organization-gate";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { whenOrgBootstrapResolved } from "@/lib/organizations/orgBootstrapGate";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { FieldList, MenuRow, SidePeek, ViewerSaveBar, ViewerSortButton, ViewTab, filtersDiffer, shownFilters, shownSorts, type FilterChoice, type SortChoice } from "./menu-parts";
import { BUILT_IN_SOURCES, newViewId, type DatabaseBlockProps, type SpaceDbView, type SpaceViewLayout } from "./sources";

/** The layouts a built-in source draws today. */
const ENTITY_LAYOUTS: Array<{ id: SpaceViewLayout; label: string; icon: typeof Table2 }> = [
  { id: "grid", label: "Table", icon: Table2 },
  { id: "kanban", label: "Board", icon: Kanban },
  { id: "chart", label: "Chart", icon: PieChart },
];

/** Spaces' chart types as records-ui's chart kinds (Notion's vertical bar = a column chart). */
const CHART_KIND: Record<string, ChartKind> = { donut: "donut", bar: "column", hbar: "bar", line: "line" };

/** Rows per read: the first page, and each "Load more" asks only the NEXT page (offset = rows held). */
const PAGE = 50;
/** How long a read may go unanswered before it is asked again (once), then named. */
const STALL_MS = 15000;

interface EntityState {
  label: string | null;
  columns: EntityColumn[];
  rows: EntityRow[];
  total: number;
  loading: boolean;
  error: string | null;
}

function sentence(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message || fallback;
  return fallback;
}

/**
 * One built-in source's presented columns and one page of rows for the view's question — the filter
 * and the sort are asked of the store (never applied to a page here), so a count and a page agree.
 */
function useEntityRows(token: string, view: SpaceDbView, search: string) {
  const client = useRecordsClient();
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<EntityState>({ label: null, columns: [], rows: [], total: 0, loading: true, error: null });
  const where = JSON.stringify(view.filters ?? {});
  const sortKey = JSON.stringify(view.sorts?.[0] ?? null);
  // A read that never answers (a stalled session in a long-lived tab) must not leave blank skeleton
  // rows forever: past STALL_MS the read is asked once more, then the block says so with Try again.
  const [stalls, setStalls] = useState(0);
  // How many rows a re-read asks for (after a write, Try again): what is held, so nothing loaded vanishes.
  const held = useRef(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const asked = useRef("");
  useEffect(() => {
    // A new question (filter, sort, source) starts again at one page; a re-read keeps what is held.
    const question = `${token}|${where}|${sortKey}|${search}`;
    if (asked.current !== question) held.current = PAGE;
    asked.current = question;
    let cancelled = false;
    let settled = false;
    const stall = setTimeout(() => {
      if (cancelled || settled) return;
      if (stalls === 0) setStalls(1);
      else setState((s) => ({ ...s, loading: false, error: "This database is taking too long to answer." }));
    }, STALL_MS);
    const source = { kind: "entity" as const, token };
    const filters = JSON.parse(where) as Record<string, unknown>;
    const sort = JSON.parse(sortKey) as { field: string; direction: "asc" | "desc" } | null;
    void Promise.all([
      client.drillDescribe({ source }),
      client.drillRows({
        source,
        ...(Object.keys(filters).length ? { where: filters } : {}),
        ...(sort ? { sort: { key: sort.field, direction: sort.direction } } : {}),
        ...(search ? { search } : {}),
        limit: held.current,
      }),
    ]).then(
      ([def, page]) => {
        settled = true;
        if (cancelled) return;
        if (!def.ok) return setState((s) => ({ ...s, loading: false, error: sentence(def.error, "This database could not be read.") }));
        if (!page.ok) return setState((s) => ({ ...s, loading: false, error: sentence(page.error, "This database’s rows could not be read.") }));
        const api = (def.data as unknown as { api?: { label?: string; columns?: EntityColumn[] }; label?: string }).api;
        const shown = new Set((page.data.columns ?? []).filter((c): c is string => typeof c === "string"));
        const columns = (api?.columns ?? []).filter((c) => c.api_name !== "id" && (shown.size === 0 || shown.has(c.api_name) || shown.has(c.lookup?.via ?? "")));
        setState({
          label: api?.label ?? (def.data as unknown as { label?: string }).label ?? token,
          columns,
          rows: (page.data.rows ?? []) as EntityRow[],
          total: Number(page.data.total ?? 0),
          loading: false,
          error: null,
        });
      },
      (thrown: unknown) => {
        settled = true;
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: sentence(thrown, "This database could not be read.") }));
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(stall);
    };
  }, [client, token, where, sortKey, search, tick, stalls]);

  const reload = () => {
    setStalls(0);
    setState((s) => ({ ...s, loading: true, error: null }));
    setTick((t) => t + 1);
  };
  const rows = state.rows;
  const hasMore = !state.loading && !state.error && state.total > rows.length;
  /** "Load more": ONE read of the next page (offset = rows held), appended — never the whole source again. */
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const filters = JSON.parse(where) as Record<string, unknown>;
    const sort = JSON.parse(sortKey) as { field: string; direction: "asc" | "desc" } | null;
    try {
      const page = await client.drillRows({
        source: { kind: "entity", token },
        ...(Object.keys(filters).length ? { where: filters } : {}),
        ...(sort ? { sort: { key: sort.field, direction: sort.direction } } : {}),
        ...(search ? { search } : {}),
        limit: PAGE,
        offset: rows.length,
      });
      if (!page.ok) {
        toast.error(sentence(page.error, "More rows could not be read."));
        return;
      }
      const next = (page.data.rows ?? []) as EntityRow[];
      setState((s) => {
        const seen = new Set(s.rows.map((r) => r.id));
        const merged = [...s.rows, ...next.filter((r) => !seen.has(r.id))];
        held.current = Math.max(PAGE, merged.length);
        return { ...s, rows: merged, total: Number(page.data.total ?? s.total) };
      });
    } catch (thrown) {
      toast.error(sentence(thrown, "More rows could not be read."));
    } finally {
      setLoadingMore(false);
    }
  };
  const write = async (rowId: string, apiName: string, value: unknown): Promise<string | null> => {
    const seen = rows.find((r) => r.id === rowId)?.["version"];
    const done = await client.entityRowWrite({ token, record_id: rowId, columns: { [apiName]: value }, ...(typeof seen === "number" ? { expected_version: seen } : {}) });
    if (!done.ok) return sentence(done.error, "That change was not saved.");
    setTick((t) => t + 1);
    return null;
  };
  return { ...state, write, reload, loadMore, hasMore, loadingMore };
}

type Entity = ReturnType<typeof useEntityRows>;

const TITLE_KEYS = ["title", "name", "full_name", "display_name", "deal_name", "subject"];
function titleColumn(columns: EntityColumn[]): EntityColumn | undefined {
  return TITLE_KEYS.map((k) => columns.find((c) => c.api_name === k)).find(Boolean) ?? columns.find((c) => c.type === "text") ?? columns[0];
}

const isBareId = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function isDateType(type: string): boolean {
  return /date|time/i.test(type);
}

function valueText(c: EntityColumn, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && isDateType(c.type) && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Cell({ c, v }: { c: EntityColumn; v: unknown }) {
  // A bare id is not something a person reads; the module names it through a lookup column (NEEDS.md).
  if (isBareId(v)) return null;
  const text = valueText(c, v);
  if (!text) return null;
  if (c.type === "choice") return <span className="spaces-entity-pill">{text}</span>;
  return <span className="truncate">{text}</span>;
}

/** Field-shaped words for the shared menu pieces. */
const asFields = (columns: EntityColumn[]) => columns.map((c) => ({ key: c.api_name, label: c.name }));

export interface EntityDatabaseProps {
  token: string;
  props: DatabaseBlockProps;
  raw: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  editable: boolean;
  /** A page on the web reads the rows it published (a read-only store) instead of the live module doors. */
  published?: RecordsConfig;
}

export function EntityDatabase(p: EntityDatabaseProps) {
  // A built-in module is read as the person; writes name the active organization (the module's door
  // asks for one). The store decides every row — the organization is never a list filter here.
  // org-filter: write-target the module's write door names the organization the person is working in
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const config = useAppRecordsConfig(organizationId ?? null);
  return (
    // org-filter: write-target a built-in source's writes go through the active organization
    <RecordsMount letTheStoreDecideRights config={p.published ?? config}>
      <EntityFrame {...p} />
    </RecordsMount>
  );
}

function EntityFrame({ token, props, raw, onChange, editable }: EntityDatabaseProps) {
  const views: SpaceDbView[] = props.views?.length ? props.views : [{ id: "view-all", name: "All", layout: "grid" }];
  const active = views.find((v) => v.id === props.activeViewId) ?? views[0];
  // The toolbar sort is this viewer's own, per view, never written to the view (Notion); the store is
  // asked with it, so the page and the count agree.
  const [sortChoices, setSortChoices] = useState<Record<string, SortChoice>>({});
  // The toolbar filter is the viewer's own the same way, until an editor saves it for everyone.
  const [filterChoices, setFilterChoices] = useState<Record<string, FilterChoice>>({});
  const shown: SpaceDbView = { ...active, sorts: shownSorts(active, sortChoices[active.id]), filters: shownFilters(active, filterChoices[active.id]) };
  // The magnifier (Notion's toolbar search): this viewer's own, per view, never saved; asked of the door
  // (drillRows `search`), so the count and Load more answer the search, not the page held.
  const [searchChoices, setSearchChoices] = useState<Record<string, string>>({});
  const [searchOpen, setSearchOpen] = useState<Record<string, boolean>>({});
  const term = searchChoices[active.id] ?? "";
  const [asked, setAsked] = useState(term);
  useEffect(() => {
    const t = window.setTimeout(() => setAsked(term.trim()), 250);
    return () => window.clearTimeout(t);
  }, [term]);
  const setTerm = (value: string) => setSearchChoices((all) => ({ ...all, [active.id]: value }));
  const closeSearch = () => {
    setTerm("");
    setSearchOpen((all) => ({ ...all, [active.id]: false }));
  };
  const entity = useEntityRows(token, shown, asked);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const save = (patch: Partial<DatabaseBlockProps>) => onChange({ ...raw, ...patch });
  const saveView = (patch: Partial<SpaceDbView>) => save({ views: views.map((v) => (v.id === active.id ? { ...v, ...patch } : v)), activeViewId: active.id });
  const known = BUILT_IN_SOURCES.find((b) => b.token === token)?.name;
  const client = useRecordsClient();
  // "New" (F7): one row added in place through the module's write door, then opened in the peek.
  // A new row is filed in the organization the person is working in (the write target, never a filter).
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const addRow = async () => {
    let organization_id: string;
    try {
      // "New" is a click, always the person's act: the organization gate reads any press inside the page
      // editor (a contenteditable) as typing and would refuse without asking, so the act is named here.
      await whenOrgBootstrapResolved();
      organization_id = await ensureOrganizationForWrite(activeOrganizationId, { interactive: true });
    } catch (err) {
      if (!isOrganizationSelectionCancelled(err)) toast.error(sentence(err, "A row could not be added here."));
      return;
    }
    // Notion's new row starts with an empty title ("Untitled" until named); a module's title is required.
    const title = titleColumn(entity.columns);
    const res = await client.entityRowWrite({ token, record_id: null, organization_id, columns: title?.writable ? { [title.api_name]: "" } : {} });
    if (!res.ok) {
      toast.error(sentence(res.error, "A row could not be added here."));
      return;
    }
    entity.reload();
    const id = (res.data as unknown as { id?: string }).id;
    if (id) setOpen(id);
  };
  const sourceName = props.title || entity.label || known || token;

  const body = <EntityBody token={token} entity={entity} view={shown} onOpen={setOpen} search={asked} />;

  return (
    <div className="spaces-db-frame" data-layout={active.layout} data-source="entity">
      {props.showTitle !== false ? (
        <div className="spaces-db-title">
          {props.linked ? <ArrowUpRight size={14} strokeWidth={2} className="spaces-db-linked" /> : null}
          <span>{sourceName}</span>
        </div>
      ) : null}
      <div className="spaces-db-bar">
        <div className="spaces-db-tabs" role="tablist">
          {views.map((v) => {
            const Icon = ENTITY_LAYOUTS.find((l) => l.id === v.layout)?.icon ?? Table2;
            return (
              <ViewTab
                key={v.id}
                view={v}
                icon={<Icon size={14} strokeWidth={1.8} />}
                active={v.id === active.id}
                editable={editable}
                onSelect={() => save({ activeViewId: v.id })}
                onRename={(name) => save({ views: views.map((x) => (x.id === v.id ? { ...x, name } : x)), activeViewId: v.id })}
                onDuplicate={() => {
                  const copy = { ...v, id: newViewId(), name: `${v.name} (copy)` };
                  save({ views: [...views, copy], activeViewId: copy.id });
                }}
                onDelete={
                  views.length > 1
                    ? () => {
                        const rest = views.filter((x) => x.id !== v.id);
                        save({ views: rest, activeViewId: rest[0].id });
                      }
                    : undefined
                }
              />
            );
          })}
          {editable ? (
            <Button
              variant="quiet"
              icon={<Plus size={14} />}
              aria-label="Add view"
              onClick={() => {
                const v: SpaceDbView = { id: newViewId(), name: "Table", layout: "grid" };
                save({ views: [...views, v], activeViewId: v.id });
              }}
            />
          ) : null}
        </div>
        <div className="spaces-db-tools">
          {searchOpen[active.id] || term ? (
            <div className="spaces-db-search">
              <Search size={14} strokeWidth={1.8} aria-hidden />
              <Input
                autoFocus
                type="search"
                aria-label="Search this database"
                placeholder="Type to search…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
                onBlur={() => {
                  if (!term) setSearchOpen((all) => ({ ...all, [active.id]: false }));
                }}
              />
              {term ? <Button variant="quiet" icon={<X size={13} />} aria-label="Clear search" onClick={closeSearch} /> : null}
            </div>
          ) : (
            <Button variant="quiet" icon={<Search size={15} strokeWidth={1.8} />} aria-label="Search" title="Search" onClick={() => setSearchOpen((all) => ({ ...all, [active.id]: true }))} />
          )}
          <EntityFilter
            view={active}
            columns={entity.columns}
            choice={filterChoices[active.id]}
            onChoice={(c) => setFilterChoices((all) => ({ ...all, [active.id]: c }))}
            canSave={editable}
            onSave={(filters) => saveView({ filters })}
          />
          <ViewerSortButton
            view={active}
            fields={asFields(entity.columns.filter((c) => !c.lookup))}
            choice={sortChoices[active.id]}
            onChoice={(c) => setSortChoices((all) => ({ ...all, [active.id]: c }))}
            canSave={editable}
            onSave={(sorts) => saveView({ sorts })}
            icon={<ArrowDownUp size={15} strokeWidth={1.8} />}
          />
          <Button variant="quiet" icon={<Maximize2 size={15} strokeWidth={1.8} />} aria-label="Open as full page" title="Open as full page" onClick={() => setExpanded(true)} />
          <EntitySettings view={active} columns={entity.columns} props={props} onView={saveView} onBlock={save} editable={editable} />
          {editable ? (
            <Button variant="primary" onClick={() => void addRow()}>
              New
            </Button>
          ) : null}
        </div>
      </div>
      {body}

      {open ? <EntityPeek entity={entity} rowId={open} as={props.openAs ?? "side"} editable={editable} onClose={() => setOpen(null)} /> : null}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent size="2xl" height="tall" className="spaces-db-expanded overflow-auto">
          <DialogTitle>{sourceName}</DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntityBody({ token, entity, view, onOpen, search }: { token: string; entity: Entity; view: SpaceDbView; onOpen: (id: string) => void; search: string }) {
  const hidden = new Set(view.hiddenFields ?? []);
  const shown = entity.columns.filter((c) => !hidden.has(c.api_name));
  const title = titleColumn(entity.columns);
  // Title first, as Notion's "Aa" column.
  const ordered = title && shown.includes(title) ? [title, ...shown.filter((c) => c !== title)] : shown;
  const columns: MatrxColumnDef<EntityRow>[] = ordered.map((c) => ({
        id: c.api_name,
        header: c.name,
        label: c.name,
        accessorFn: (row: EntityRow) => (row[c.api_name] ?? null) as never,
        // The title opens the row (Notion's title cell): the table's own row click never fires inside the
        // page editor — its "interactive descendant" test walks up to the editor's contenteditable (NEEDS.md).
        cell: (row: EntityRow) =>
          c === title ? (
            <button type="button" className="spaces-entity-open" onClick={() => onOpen(String(row.id))}>
              <span className="truncate">{valueText(c, row[c.api_name]) || "Untitled"}</span>
              <span className="spaces-entity-openpill" aria-hidden>
                <PanelRight size={12} strokeWidth={2} />
                Open
              </span>
            </button>
          ) : (
            <Cell c={c} v={row[c.api_name]} />
          ),
        sortable: false,
        width: c === title ? 280 : c.type === "choice" ? 140 : 180,
        minWidth: 100,
      }));
  if (entity.error) {
    return (
      <div className="spaces-db-note">
        <ErrorNotice title="This database could not be read" message={entity.error} size="compact" />
        <Button variant="quiet" onClick={entity.reload}>
          Try again
        </Button>
      </div>
    );
  }
  // The default grouping is a choice the module names in words (a project's Status), never a lookup
  // the door answers as bare ids (Created by) — those drew a legend of uuids.
  const choice = entity.columns.find((c) => c.type === "choice") ?? entity.columns.find((c) => c.lookup && c.lookup.replaces);
  if (view.layout === "chart") {
    const by = view.chart?.groupBy ?? view.groupField ?? choice?.api_name;
    return (
      <div className="spaces-db-body">
        <EntityChartBlock
          source={{ kind: "entity", token }}
          kind={CHART_KIND[view.chart?.type ?? "donut"] ?? "donut"}
          by={by ?? undefined}
          where={view.filters && Object.keys(view.filters).length ? view.filters : undefined}
          title={view.name}
          centerValue={view.chart?.centerValue ?? true}
          variant="bare"
        />
      </div>
    );
  }
  if (view.layout === "kanban") {
    // records-ui's board over the source: lanes per stage / status, cards move between them.
    return (
      <div className="spaces-db-body">
        <TablePage source={{ kind: "entity", token }} presentation="embedded" layout="board" groupBy={view.groupField ?? choice?.api_name} onOpenRecord={onOpen} searchOverride={search || null} searchBox={false} />
      </div>
    );
  }
  return (
    <div className="spaces-db-body">
      {(
        <MatrxDataTable<EntityRow>
          data={entity.rows}
          columns={columns}
          getRowId={(row) => String(row.id)}
          isLoading={entity.loading && !entity.rows.length}
          hideToolbar
          hidePagination
          pageSize={Math.max(entity.rows.length, 1)}
          selection={false}
          frameHeight="content"
          fitToWidth={false}
          copy={false}
          cellLines="one"
          // The same table behaviour as a custom table's grid (records-ui Grid): no detail panel and no row
          // window of the table's own, a spreadsheet cell cursor — one click selects a cell, Enter opens the
          // record, a typed letter goes to the record window (where a built-in row is written), never to the page.
          detail={{ enabled: false }}
          window={{ enabled: false }}
          spreadsheet={{
            enabled: true,
            writableColumnIds: entity.columns.filter((c) => c.writable).map((c) => c.api_name),
            onPatch: (patches) => {
              for (const patch of patches) void entity.write(String(patch.rowId), String(patch.columnId), patch.value);
            },
            onEditRequest: (address) => {
              onOpen(address.rowId);
              return true;
            },
          }}
          onRowOpen={(row) => onOpen(String(row.id))}
          emptyState={{ title: "No rows" } as never}
        />
      )}
      <div className="spaces-entity-count type-secondary text-muted-foreground">
        {entity.loading && !entity.rows.length ? "" : `${entity.total.toLocaleString()} ${entity.total === 1 ? "row" : "rows"}`}
        {entity.hasMore ? (
          <Button variant="quiet" disabled={entity.loadingMore} onClick={() => void entity.loadMore()}>
            {entity.loadingMore ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The toolbar filter (Notion): anyone may filter for themselves; an editor may save it for everyone. */
function EntityFilter({
  view,
  columns,
  choice: viewerChoice,
  onChoice,
  canSave,
  onSave,
}: {
  view: SpaceDbView;
  columns: EntityColumn[];
  choice: FilterChoice;
  onChoice: (next: FilterChoice) => void;
  canSave: boolean;
  onSave: (filters: NonNullable<SpaceDbView["filters"]>) => void;
}) {
  const [field, setField] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const filters = shownFilters(view, viewerChoice);
  const onView = (p: { filters: NonNullable<SpaceDbView["filters"]> }) => onChoice(p.filters);
  const count = Object.keys(filters).length;
  const col = columns.find((c) => c.api_name === field);
  const labelOf = (k: string) => columns.find((c) => c.api_name === k)?.name ?? k;
  return (
    <Popover onOpenChange={(o) => (o ? null : setField(null))}>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<ListFilter size={15} strokeWidth={1.8} />} aria-label="Filter" title="Filter" data-on={count ? "true" : undefined} />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" width="md" padding="xs">
        {Object.entries(filters).map(([k, v]) => (
          <MenuRow
            key={k}
            label={Array.isArray(v) ? `${labelOf(k)} is any of ${v.join(", ")}` : `${labelOf(k)} is ${String(v)}`}
            end={<X size={14} />}
            onClick={() => {
              const { [k]: _gone, ...rest } = filters;
              onView({ filters: rest });
            }}
          />
        ))}
        {col?.choices?.length ? (
          <div className="flex flex-col p-1">
            <span className="px-1 pb-1 type-secondary text-muted-foreground">{col.name} is any of</span>
            {col.choices.map((choice) => {
              const now = filters[col.api_name];
              const list = Array.isArray(now) ? now : typeof now === "string" ? [now] : [];
              const on = list.includes(choice);
              return (
                <MenuRow
                  key={choice}
                  label={choice}
                  end={<Switch checked={on} tabIndex={-1} aria-hidden />}
                  onClick={() => {
                    const next = on ? list.filter((x) => x !== choice) : [...list, choice];
                    const { [col.api_name]: _gone, ...rest } = filters;
                    onView({ filters: next.length ? { ...rest, [col.api_name]: next } : rest });
                  }}
                />
              );
            })}
          </div>
        ) : col ? (
          <div className="flex flex-col gap-2 p-1">
            <span className="type-secondary text-muted-foreground">{col.name} is</span>
            <Input
              autoFocus
              value={value}
              aria-label="Filter value"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && value.trim()) {
                  onView({ filters: { ...filters, [col.api_name]: value.trim() } });
                  setField(null);
                  setValue("");
                }
              }}
            />
          </div>
        ) : (
          <FieldList fields={asFields(columns.filter((c) => !c.lookup))} onPick={setField} />
        )}
        {filtersDiffer(view, viewerChoice) ? (
          <ViewerSaveBar
            canSave={canSave}
            onReset={() => onChoice(undefined)}
            onSave={() => {
              onSave(filters);
              onChoice(undefined);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function EntitySettings({
  view,
  columns,
  props,
  onView,
  onBlock,
  editable,
}: {
  view: SpaceDbView;
  columns: EntityColumn[];
  props: DatabaseBlockProps;
  onView: (p: Partial<SpaceDbView>) => void;
  onBlock: (p: Partial<DatabaseBlockProps>) => void;
  editable: boolean;
}) {
  const [page, setPage] = useState<"main" | "layout" | "group" | "props">("main");
  const hidden = view.hiddenFields ?? [];
  const groupCol = columns.find((c) => c.api_name === view.groupField) ?? columns.find((c) => c.type === "choice");
  return (
    <Popover onOpenChange={(o) => (o ? setPage("main") : null)}>
      <PopoverTrigger asChild>
        <button type="button" className="spaces-db-icon" aria-label="View settings" title="View settings">
          <SlidersHorizontal size={15} strokeWidth={1.8} />
        </button>
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" width="md" padding="xs">
        {page === "main" ? (
          <>
            <div className="px-2 py-1 type-secondary text-muted-foreground">View options</div>
            <MenuRow icon={<Table2 size={15} />} label="Layout" end={<span className="type-secondary text-muted-foreground">{ENTITY_LAYOUTS.find((l) => l.id === view.layout)?.label ?? "Table"}</span>} onClick={() => editable && setPage("layout")} />
            <MenuRow icon={<List size={15} />} label="Properties" end={<span className="text-xs text-muted-foreground">{columns.length - hidden.filter((k) => columns.some((c) => c.api_name === k)).length} shown</span>} onClick={() => setPage("props")} />
            {view.layout === "kanban" ? <MenuRow icon={<Kanban size={15} />} label="Group" end={<span className="type-secondary text-muted-foreground">{groupCol?.name ?? "None"}</span>} onClick={() => editable && setPage("group")} /> : null}
            <div className="px-2 pt-2 pb-1 type-secondary text-muted-foreground">Open pages in</div>
            {([
              ["side", "Side peek", PanelRight],
              ["center", "Center peek", Square],
              ["page", "Full page", Maximize2],
            ] as const).map(([id, text, Icon]) => (
              <MenuRow key={id} icon={<Icon size={15} />} label={text} active={(props.openAs ?? "side") === id} onClick={() => editable && onBlock({ openAs: id })} />
            ))}
            <MenuRow icon={<Database size={15} />} label="Show database title" end={<Switch checked={props.showTitle !== false} tabIndex={-1} aria-hidden />} onClick={() => editable && onBlock({ showTitle: props.showTitle === false })} />
          </>
        ) : null}
        {page === "layout"
          ? ENTITY_LAYOUTS.map((l) => (
              <MenuRow
                key={l.id}
                icon={<l.icon size={15} />}
                label={l.label}
                active={view.layout === l.id}
                onClick={() => {
                  onView({ layout: l.id, name: view.name === ENTITY_LAYOUTS.find((x) => x.id === view.layout)?.label ? l.label : view.name });
                  setPage("main");
                }}
              />
            ))
          : null}
        {page === "props"
          ? columns.map((c) => {
              const off = hidden.includes(c.api_name);
              return (
                <MenuRow
                  key={c.api_name}
                  label={c.name}
                  end={<Switch checked={!off} tabIndex={-1} aria-hidden />}
                  onClick={() => editable && onView({ hiddenFields: off ? hidden.filter((k) => k !== c.api_name) : [...hidden, c.api_name] })}
                />
              );
            })
          : null}
        {page === "group" ? <FieldList fields={asFields(columns.filter((c) => c.type === "choice"))} value={groupCol?.api_name} onPick={(k) => (onView({ groupField: k }), setPage("main"))} /> : null}
      </PopoverContent>
    </Popover>
  );
}

/** A row of a built-in module, opened as Notion opens a database page: its properties, editable where the module allows. */
function EntityPeek({ entity, rowId, as, editable, onClose }: { entity: Entity; rowId: string; as: "side" | "center" | "page"; editable: boolean; onClose: () => void }) {
  const row = entity.rows.find((r) => r.id === rowId);
  const title = titleColumn(entity.columns);
  const content: ReactNode = row ? (
    <div className="spaces-entity-peek">
      <h2 className="spaces-entity-peektitle">{title ? valueText(title, row[title.api_name]) || "Untitled" : "Untitled"}</h2>
      <div className="spaces-entity-props">
        {entity.columns
          // A bare id is not a property a person reads (the module's lookup column carries its name).
          .filter((c) => c !== title && !isBareId(row[c.api_name]))
          .map((c) => (
            <PropRow key={c.api_name} c={c} value={row[c.api_name]} editable={editable && c.writable === true && !c.lookup} onWrite={(v) => entity.write(rowId, c.api_name, v)} />
          ))}
      </div>
    </div>
  ) : (
    <div className="spaces-db-note">This row is no longer in the view.</div>
  );
  if (as === "side") {
    return (
<SidePeek onClose={onClose}>{content}</SidePeek>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent size={as === "page" ? "screen" : "xl"} className="overflow-auto">
        <DialogTitle className="sr-only">{entity.label ?? "Row"}</DialogTitle>
        {content}
      </DialogContent>
    </Dialog>
  );
}

function PropRow({ c, value, editable, onWrite }: { c: EntityColumn; value: unknown; editable: boolean; onWrite: (v: unknown) => Promise<string | null> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = async (v: unknown) => {
    const refused = await onWrite(v);
    if (refused) toast.error(refused);
  };
  let control: ReactNode = <Cell c={c} v={value} />;
  if (editable && c.type === "choice" && c.choices?.length) {
    control = (
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="spaces-entity-propvalue" aria-label={c.name}>
            <Cell c={c} v={value} />
            {valueText(c, value) ? null : <span className="text-muted-foreground">Empty</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent surface="solid" align="start" width="sm" padding="xs">
          {c.choices.map((choice) => (
            <MenuRow key={choice} label={choice} active={value === choice} onClick={() => void commit(choice)} />
          ))}
        </PopoverContent>
      </Popover>
    );
  } else if (editable && c.type !== "choice") {
    const shownValue = draft ?? (value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value));
    control = (
      <Input
        value={shownValue}
        aria-label={c.name}
        placeholder="Empty"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onBlur={() => {
          if (draft === null) return;
          const v = draft === "" ? null : c.type === "number" || c.type === "integer" ? Number(draft) : draft;
          setDraft(null);
          void commit(v);
        }}
      />
    );
  }
  return (
    <div className="spaces-entity-prop">
      <span className="spaces-entity-propname">{c.name}</span>
      <div className="spaces-entity-propvalue-wrap">{control ?? <span className="text-muted-foreground">Empty</span>}</div>
    </div>
  );
}
