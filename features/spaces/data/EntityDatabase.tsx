"use client";

// features/spaces/data/EntityDatabase.tsx — a database block over a built-in module (F10): tasks,
// projects, deals, employees — `{kind: "entity", token}` read through the drill doors AS THE PERSON.
//
// The store answers which rows a person sees; this block only asks a question of it (a filter, a
// sort) and draws the answer: table (the one data table), board (read-only — moving a card between
// groups waits on the package), a side / center / full-page peek whose writable properties save
// through the module's own write door. Charts over a built-in source are not drawn yet (NEEDS.md).

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Input, Switch } from "@ai-matrx/design-system/controls";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { RecordsMount, type EntityColumn, type EntityRow } from "@ai-matrx/records-ui";
import { useRecordsClient } from "@ai-matrx/records/react";
import { ArrowDownUp, ArrowUpRight, Database, Kanban, List, ListFilter, Maximize2, PanelRight, Plus, SlidersHorizontal, Square, Table2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";

import { FieldList, MenuRow, ViewTab } from "./menu-parts";
import { BUILT_IN_SOURCES, newViewId, type DatabaseBlockProps, type SpaceDbView, type SpaceViewLayout } from "./sources";

/** The layouts a built-in source draws today. */
const ENTITY_LAYOUTS: Array<{ id: SpaceViewLayout; label: string; icon: typeof Table2 }> = [
  { id: "grid", label: "Table", icon: Table2 },
  { id: "kanban", label: "Board", icon: Kanban },
];

const PAGE = 100;

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
function useEntityRows(token: string, view: SpaceDbView, limit: number) {
  const client = useRecordsClient();
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<EntityState>({ label: null, columns: [], rows: [], total: 0, loading: true, error: null });
  const where = JSON.stringify(view.filters ?? {});
  const sortKey = JSON.stringify(view.sorts?.[0] ?? null);
  useEffect(() => {
    let cancelled = false;
    const source = { kind: "entity" as const, token };
    const filters = JSON.parse(where) as Record<string, unknown>;
    const sort = JSON.parse(sortKey) as { field: string; direction: "asc" | "desc" } | null;
    void Promise.all([
      client.drillDescribe({ source }),
      client.drillRows({
        source,
        ...(Object.keys(filters).length ? { where: filters } : {}),
        ...(sort ? { sort: { key: sort.field, direction: sort.direction } } : {}),
        limit,
      }),
    ]).then(
      ([def, page]) => {
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
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: sentence(thrown, "This database could not be read.") }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, token, where, sortKey, limit, tick]);
  const reload = () => setTick((t) => t + 1);
  const rows = state.rows;
  const write = async (rowId: string, apiName: string, value: unknown): Promise<string | null> => {
    const seen = rows.find((r) => r.id === rowId)?.["version"];
    const done = await client.entityRowWrite({ token, record_id: rowId, columns: { [apiName]: value }, ...(typeof seen === "number" ? { expected_version: seen } : {}) });
    if (!done.ok) return sentence(done.error, "That change was not saved.");
    setTick((t) => t + 1);
    return null;
  };
  return { ...state, write, reload };
}

type Entity = ReturnType<typeof useEntityRows>;

const TITLE_KEYS = ["title", "name", "full_name", "display_name", "deal_name", "subject"];
function titleColumn(columns: EntityColumn[]): EntityColumn | undefined {
  return TITLE_KEYS.map((k) => columns.find((c) => c.api_name === k)).find(Boolean) ?? columns.find((c) => c.type === "text") ?? columns[0];
}

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
}

export function EntityDatabase(p: EntityDatabaseProps) {
  // A built-in module is read as the person; writes name the active organization (the module's door
  // asks for one). The store decides every row — the organization is never a list filter here.
  // org-filter: write-target the module's write door names the organization the person is working in
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const config = useAppRecordsConfig(organizationId ?? null);
  return (
    // org-filter: write-target a built-in source's writes go through the active organization
    <RecordsMount letTheStoreDecideRights config={config}>
      <EntityFrame {...p} />
    </RecordsMount>
  );
}

function EntityFrame({ token, props, raw, onChange, editable }: EntityDatabaseProps) {
  const views: SpaceDbView[] = props.views?.length ? props.views : [{ id: "view-all", name: "All", layout: "grid" }];
  const active = views.find((v) => v.id === props.activeViewId) ?? views[0];
  const [limit, setLimit] = useState(PAGE);
  const entity = useEntityRows(token, active, limit);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const save = (patch: Partial<DatabaseBlockProps>) => onChange({ ...raw, ...patch });
  const saveView = (patch: Partial<SpaceDbView>) => save({ views: views.map((v) => (v.id === active.id ? { ...v, ...patch } : v)), activeViewId: active.id });
  const known = BUILT_IN_SOURCES.find((b) => b.token === token)?.name;
  const sourceName = props.title || entity.label || known || token;

  const body = <EntityBody entity={entity} view={active} onOpen={setOpen} limit={limit} onMore={() => setLimit((n) => n + PAGE)} />;

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
          <EntityFilter view={active} columns={entity.columns} onView={saveView} editable={editable} />
          <EntitySort view={active} columns={entity.columns} onView={saveView} editable={editable} />
          <Button variant="quiet" icon={<Maximize2 size={15} strokeWidth={1.8} />} aria-label="Open as full page" title="Open as full page" onClick={() => setExpanded(true)} />
          <EntitySettings view={active} columns={entity.columns} props={props} onView={saveView} onBlock={save} editable={editable} />
        </div>
      </div>
      {body}

      {open ? <EntityPeek entity={entity} rowId={open} as={props.openAs ?? "side"} editable={editable} onClose={() => setOpen(null)} /> : null}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="spaces-db-expanded max-w-[min(1200px,96vw)] h-[90dvh] overflow-auto">
          <DialogTitle>{sourceName}</DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntityBody({ entity, view, onOpen, limit, onMore }: { entity: Entity; view: SpaceDbView; onOpen: (id: string) => void; limit: number; onMore: () => void }) {
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
        cell: (row: EntityRow) => <Cell c={c} v={row[c.api_name]} />,
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
  const more = entity.total > entity.rows.length && entity.rows.length >= limit;
  return (
    <div className="spaces-db-body">
      {view.layout === "kanban" ? (
        <EntityBoard entity={entity} view={view} title={title} shown={ordered} onOpen={onOpen} />
      ) : (
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
          onRowOpen={(row) => onOpen(String(row.id))}
          emptyState={{ title: "No rows" } as never}
        />
      )}
      <div className="spaces-entity-count type-secondary text-muted-foreground">
        {entity.loading && !entity.rows.length ? "" : `${entity.total.toLocaleString()} ${entity.total === 1 ? "row" : "rows"}`}
        {more ? (
          <Button variant="quiet" onClick={onMore}>
            Load more
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Board: one column per choice of the group property. Cards open the peek; moving a card is the package's next release. */
function EntityBoard({ entity, view, title, shown, onOpen }: { entity: Entity; view: SpaceDbView; title?: EntityColumn; shown: EntityColumn[]; onOpen: (id: string) => void }) {
  const group = entity.columns.find((c) => c.api_name === view.groupField) ?? entity.columns.find((c) => c.type === "choice");
  if (!group) return <div className="spaces-db-note">Board needs a choice property to group by.</div>;
  const names = [...(group.choices ?? [])];
  for (const r of entity.rows) {
    const v = r[group.api_name];
    const k = v === null || v === undefined || v === "" ? "" : String(v);
    if (!names.includes(k)) names.push(k);
  }
  const extra = shown.filter((c) => c !== title && c !== group).slice(0, 3);
  return (
    <div className="spaces-entity-board" role="list">
      {names.map((name) => {
        const cards = entity.rows.filter((r) => String(r[group.api_name] ?? "") === name);
        return (
          <section key={name || "none"} className="spaces-entity-lane" aria-label={name || `No ${group.name}`}>
            <header className="spaces-entity-lanehead">
              <span className="spaces-entity-pill">{name || `No ${group.name}`}</span>
              <span className="type-secondary text-muted-foreground">{cards.length}</span>
            </header>
            {cards.map((r) => (
              <button key={r.id} type="button" className="spaces-entity-card" onClick={() => onOpen(r.id)}>
                <span className="spaces-entity-cardtitle">{title ? valueText(title, r[title.api_name]) || "Untitled" : "Untitled"}</span>
                {extra.map((c) => {
                  const t = valueText(c, r[c.api_name]);
                  return t ? (
                    <span key={c.api_name} className="type-secondary text-muted-foreground truncate">
                      {t}
                    </span>
                  ) : null;
                })}
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function EntityFilter({ view, columns, onView, editable }: { view: SpaceDbView; columns: EntityColumn[]; onView: (p: Partial<SpaceDbView>) => void; editable: boolean }) {
  const [field, setField] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const filters = view.filters ?? {};
  const count = Object.keys(filters).length;
  const col = columns.find((c) => c.api_name === field);
  const labelOf = (k: string) => columns.find((c) => c.api_name === k)?.name ?? k;
  return (
    <Popover onOpenChange={(o) => (o ? null : setField(null))}>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<ListFilter size={15} strokeWidth={1.8} />} aria-label="Filter" title="Filter" data-on={count ? "true" : undefined} />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" className="w-[280px] p-1">
        {Object.entries(filters).map(([k, v]) => (
          <MenuRow
            key={k}
            label={Array.isArray(v) ? `${labelOf(k)} is any of ${v.join(", ")}` : `${labelOf(k)} is ${String(v)}`}
            end={editable ? <X size={14} /> : undefined}
            onClick={() => {
              if (!editable) return;
              const { [k]: _gone, ...rest } = filters;
              onView({ filters: rest });
            }}
          />
        ))}
        {!editable ? null : col?.choices?.length ? (
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
      </PopoverContent>
    </Popover>
  );
}

function EntitySort({ view, columns, onView, editable }: { view: SpaceDbView; columns: EntityColumn[]; onView: (p: Partial<SpaceDbView>) => void; editable: boolean }) {
  const sort = view.sorts?.[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<ArrowDownUp size={15} strokeWidth={1.8} />} aria-label="Sort" title="Sort" data-on={sort ? "true" : undefined} />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" className="w-[260px] p-1">
        {sort ? (
          <div className="flex items-center gap-1 p-1 type-body">
            <span className="flex-1 truncate">{columns.find((c) => c.api_name === sort.field)?.name ?? sort.field}</span>
            <Button variant="outline" disabled={!editable} onClick={() => onView({ sorts: [{ field: sort.field, direction: sort.direction === "asc" ? "desc" : "asc" }] })}>
              {sort.direction === "asc" ? "Ascending" : "Descending"}
            </Button>
            {editable ? <Button variant="quiet" icon={<X size={14} />} aria-label="Remove sort" onClick={() => onView({ sorts: [] })} /> : null}
          </div>
        ) : editable ? (
          <FieldList fields={asFields(columns.filter((c) => !c.lookup))} onPick={(key) => onView({ sorts: [{ field: key, direction: "asc" }] })} />
        ) : (
          <p className="p-2 type-body text-muted-foreground">No sorts</p>
        )}
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
      <PopoverContent surface="solid" align="end" className="w-[280px] p-1">
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
          .filter((c) => c !== title)
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
      <aside className="spaces-peek-side" aria-label="Side peek">
        <div className="spaces-peek-bar">
          <Button variant="quiet" icon={<X size={16} />} aria-label="Close" onClick={onClose} />
        </div>
        <div className="spaces-peek-body">{content}</div>
      </aside>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className={as === "page" ? "max-w-[100vw] w-[100vw] h-[100dvh] rounded-none overflow-auto" : "max-w-[860px] w-[92vw] max-h-[86dvh] overflow-auto"}>
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
        <PopoverContent surface="solid" align="start" className="w-[220px] p-1">
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
