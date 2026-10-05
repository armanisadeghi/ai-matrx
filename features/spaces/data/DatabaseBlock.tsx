"use client";

// features/spaces/data/DatabaseBlock.tsx — Notion's inline / full-page database and "Linked view of
// database" (C24, C25, F1–F9) and chart view (C26, G1–G4), on @ai-matrx/records-ui.
//
// The block stores where its records come from (`source`), its views and which one is showing
// (data/sources.ts). Records are drawn by records-ui's `ViewSwitcher` (table, board, gallery, list,
// calendar, timeline), `DashboardCanvas` (dashboard) and data/ChartView (chart); a record opens in
// records-ui's `Peek` as a side peek, a center peek or a full page. The store decides what a person
// may read and write — this block is a filter, never a permission.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Input, Switch } from "@ai-matrx/design-system/controls";
import { DashboardCanvas, Peek, RecordForm, ViewSwitcher, type SavedViewSpec } from "@ai-matrx/records-ui";
import { useFields, useRecordsClient, useTable, type Field } from "@ai-matrx/records/react";
import {
  ArrowDownUp,
  ArrowUpRight,
  BarChart3,
  Calendar,
  ChartNoAxesColumn,
  ChevronDown,
  Database,
  FileText,
  GalleryHorizontalEnd,
  GanttChart,
  Kanban,
  LayoutDashboard,
  List,
  ListFilter,
  Maximize2,
  PanelRight,
  PieChart,
  Plus,
  Square,
  SlidersHorizontal,
  Table2,
  Users,
  Trophy,
  Gauge,
  ListChecks,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { DataMount } from "./DataMount";
import { EntityDatabase } from "./EntityDatabase";
import { FieldList, MenuRow, ViewTab } from "./menu-parts";
import { ChartView, choicesOfField } from "./ChartView";
import { AGENCY_SAMPLE_ID, newViewId, readDatabaseProps, type ChartSettings, type DatabaseBlockProps, type SpaceDbView, type SpaceViewLayout } from "./sources";

type Layout = SpaceViewLayout | "dashboard";

const LAYOUTS: Array<{ id: Layout; label: string; icon: typeof Table2 }> = [
  { id: "grid", label: "Table", icon: Table2 },
  { id: "kanban", label: "Board", icon: Kanban },
  { id: "gallery", label: "Gallery", icon: GalleryHorizontalEnd },
  { id: "list", label: "List", icon: List },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "timeline", label: "Timeline", icon: GanttChart },
  { id: "chart", label: "Chart", icon: PieChart },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const VIEW_ICONS: Record<string, typeof Table2> = { Users, PieChart, BarChart3, Table2, Trophy, Gauge, ListChecks };

function layoutIcon(view: SpaceDbView): typeof Table2 {
  if (view.icon && VIEW_ICONS[view.icon]) return VIEW_ICONS[view.icon];
  return LAYOUTS.find((l) => l.id === view.layout)?.icon ?? Table2;
}

/** The field's parity type when the store sends it (the memory store does), else its behavior word. */
function kindOf(f: Field): string {
  const parity: unknown = (f as unknown as Record<string, unknown>)["parity_type"];
  return typeof parity === "string" ? parity : String(f.type);
}

const DEFAULT_CHART: ChartSettings = { type: "donut", groupBy: null, op: "count", centerValue: true };

export interface DatabaseBlockViewProps {
  blockId: string;
  props: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  editable: boolean;
}

export function DatabaseBlock({ props: raw, onChange, editable }: DatabaseBlockViewProps) {
  const props = readDatabaseProps(raw);
  if (!props) return <div className="spaces-db-frame spaces-db-note">This database has no source.</div>;
  if (props.source.kind === "entity") return <EntityDatabase token={props.source.token} props={props} raw={raw} onChange={onChange} editable={editable} />;
  const tableId = props.source.tableId;
  return (
    <DataMount
      sample={props.sample === AGENCY_SAMPLE_ID}
      tableId={tableId}
      held={(line, retry) => (
        <div className="spaces-db-frame spaces-db-note">
          {line || <span className="spaces-db-loading" />}
          {retry && line ? (
            <Button variant="quiet" onClick={retry}>
              Try again
            </Button>
          ) : null}
        </div>
      )}
    >
      <DatabaseFrame tableId={tableId} props={props} raw={raw} onChange={onChange} editable={editable} sample={props.sample === AGENCY_SAMPLE_ID} />
    </DataMount>
  );
}

function DatabaseFrame({
  tableId,
  props,
  raw,
  onChange,
  editable,
  sample,
}: {
  tableId: string;
  props: DatabaseBlockProps;
  raw: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  editable: boolean;
  sample: boolean;
}) {
  const client = useRecordsClient();
  const table = useTable(tableId);
  const fields = useFields(tableId).data ?? [];
  const sourceName = table.data?.name ?? props.title ?? "Untitled";
  const views: SpaceDbView[] = props.views?.length ? props.views : [{ id: "view-all", name: "All", layout: "grid" }];
  const active = views.find((v) => v.id === props.activeViewId) ?? views[0];
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const save = (patch: Partial<DatabaseBlockProps>) => onChange({ ...raw, ...patch });
  const saveView = (patch: Partial<SpaceDbView>) => save({ views: views.map((v) => (v.id === active.id ? { ...v, ...patch } : v)), activeViewId: active.id });
  const isChart = active.layout === "chart";

  // "+ New page" (F7): Notion adds a row in place and opens it. A refused empty row (a required
  // column, a read-only sample) falls back to the whole-record form, which says why.
  const addRow = () => {
    void client.recordWrite({ table_id: tableId, data: {} }).then((res) => {
      if (res.ok) setOpen(res.data);
      else if (sample) toast.info("The sample is read-only. Add your own table to add rows.");
      else setCreating(true);
    });
  };

  const body = (
    <DatabaseBody
      tableId={tableId}
      view={active}
      fields={fields}
      onOpenRecord={setOpen}
      onNew={addRow}
      editable={editable}
      sample={sample}
    />
  );

  return (
    <div className="spaces-db-frame" data-layout={active.layout}>
      {props.showTitle !== false && !isChart ? (
        <div className="spaces-db-title">
          {props.linked ? <ArrowUpRight size={14} strokeWidth={2} className="spaces-db-linked" /> : null}
          <span>{props.title || sourceName}</span>
        </div>
      ) : null}
      <div className="spaces-db-bar">
        <div className="spaces-db-tabs" role="tablist">
          {views.map((v) => {
            const Icon = layoutIcon(v);
            return (
              <ViewTab
                key={v.id}
                view={v}
                icon={<Icon size={isChart ? 16 : 14} strokeWidth={1.8} />}
                active={v.id === active.id}
                pill={isChart}
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
          {isChart ? (
            <ViewSettings view={active} fields={fields} props={props} onView={saveView} onBlock={save} editable={editable} compact />
          ) : null}
          {editable && !isChart ? (
            <Button variant="quiet" icon={<Plus size={14} />} aria-label="Add view" onClick={() => {
                const v: SpaceDbView = { id: newViewId(), name: "Table", layout: "grid" };
                save({ views: [...views, v], activeViewId: v.id });
              }} />
          ) : null}
        </div>
        {!isChart ? (
          <div className="spaces-db-tools">
            <FilterButton view={active} fields={fields} onView={saveView} editable={editable} />
            <SortButton view={active} fields={fields} onView={saveView} editable={editable} />
            <Button variant="quiet" icon={<Maximize2 size={15} strokeWidth={1.8} />} aria-label="Open as full page" title="Open as full page" onClick={() => setExpanded(true)} />
            <ViewSettings view={active} fields={fields} props={props} onView={saveView} onBlock={save} editable={editable} />
            <NewButton onNew={() => setCreating(true)} />
          </div>
        ) : null}
      </div>
      {body}

      {open ? <RecordOpen tableId={tableId} recordId={open} as={props.openAs ?? "side"} onClose={() => setOpen(null)} /> : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-[640px]">
          <DialogTitle>New {table.data?.name ? `in ${table.data.name}` : "page"}</DialogTitle>
          <RecordForm tableId={tableId} />
        </DialogContent>
      </Dialog>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="spaces-db-expanded max-w-[min(1200px,96vw)] h-[90dvh] overflow-auto">
          <DialogTitle>{props.title || sourceName}</DialogTitle>
          <DatabaseBody tableId={tableId} view={active} fields={fields} onOpenRecord={setOpen} onNew={addRow} editable={editable} sample={sample} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A custom table's view filter: its "is" filters (lists are a built-in source's "any of"). */
function scalarFilters(f: SpaceDbView["filters"]): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(f ?? {})) if (!Array.isArray(v)) out[k] = v;
  return out;
}

function viewSpec(tableId: string, view: SpaceDbView): SavedViewSpec {
  const layout = view.layout === "chart" ? "grid" : view.layout;
  return {
    name: view.name,
    subject: tableId,
    layout,
    groupField: view.groupField ?? null,
    dateField: view.dateField ?? null,
    startField: view.dateField ?? null,
    sorts: view.sorts ?? [],
    filters: scalarFilters(view.filters),
    ...(view.hiddenFields?.length ? { presentation: { hiddenFields: view.hiddenFields } } : {}),
  };
}

function DatabaseBody({
  tableId,
  view,
  fields,
  onOpenRecord,
  onNew,
  editable,
  sample,
}: {
  tableId: string;
  view: SpaceDbView;
  fields: Field[];
  onOpenRecord: (id: string) => void;
  onNew: () => void;
  editable: boolean;
  sample: boolean;
}) {
  if (view.layout === "chart") {
    const settings = { ...DEFAULT_CHART, ...view.chart };
    return <ChartView tableId={tableId} settings={settings} title={view.name} overRows={sample} />;
  }
  if ((view.layout as Layout) === "dashboard") return <DashboardCanvas tableId={tableId} />;
  const needsGroup = view.layout === "kanban" && !view.groupField;
  const group = needsGroup ? fields.find((f) => ["select", "status", "list"].includes(kindOf(f)))?.key : undefined;
  const needsDate = (view.layout === "calendar" || view.layout === "timeline") && !view.dateField;
  const date = needsDate ? fields.find((f) => ["datetime", "date"].includes(kindOf(f)))?.key : undefined;
  const spec = viewSpec(tableId, { ...view, groupField: view.groupField ?? group ?? null, dateField: view.dateField ?? date ?? null });
  return (
    <div className="spaces-db-body">
      <ViewSwitcher view={spec} chooser={false} onOpenRecord={onOpenRecord} filter={view.filters && Object.keys(view.filters).length ? scalarFilters(view.filters) : undefined} />
      {editable && (view.layout === "grid" || view.layout === "list") ? (
        <Button variant="quiet" icon={<Plus size={14} strokeWidth={1.8} />} onClick={onNew}>
          New page
        </Button>
      ) : null}
    </div>
  );
}

function FilterButton({ view, fields, onView, editable }: { view: SpaceDbView; fields: Field[]; onView: (p: Partial<SpaceDbView>) => void; editable: boolean }) {
  const [field, setField] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const filters = view.filters ?? {};
  const count = Object.keys(filters).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<ListFilter size={15} strokeWidth={1.8} />} aria-label="Filter" title="Filter" data-on={count ? "true" : undefined} />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" className="w-[280px] p-1">
        {Object.entries(filters).map(([k, v]) => (
          <MenuRow
            key={k}
            label={`${fields.find((f) => f.key === k)?.label ?? k} is ${String(v)}`}
            end={editable ? <X size={14} /> : undefined}
            onClick={() => {
              if (!editable) return;
              const { [k]: _gone, ...rest } = filters;
              onView({ filters: rest });
            }}
          />
        ))}
        {editable ? (
          field && choicesOfField(fields.find((f) => f.key === field)).length ? (
            <div className="flex flex-col p-1">
              <span className="px-1 pb-1 type-secondary text-muted-foreground">{fields.find((f) => f.key === field)?.label} is</span>
              {choicesOfField(fields.find((f) => f.key === field)).map((c) => (
                <MenuRow
                  key={c.value}
                  label={c.value}
                  icon={<span className="spaces-db-choice-dot" data-color={c.color ?? "gray"} />}
                  onClick={() => {
                    onView({ filters: { ...filters, [field]: c.value } });
                    setField(null);
                  }}
                />
              ))}
            </div>
          ) : field ? (
            <div className="flex flex-col gap-2 p-1">
              <span className="type-secondary text-muted-foreground">{fields.find((f) => f.key === field)?.label} is</span>
              <Input
                autoFocus
                value={value}
                aria-label="Filter value"
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && value.trim()) {
                    onView({ filters: { ...filters, [field]: value.trim() } });
                    setField(null);
                    setValue("");
                  }
                }}
              />
            </div>
          ) : (
            <FieldList fields={fields} onPick={setField} />
          )
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function SortButton({ view, fields, onView, editable }: { view: SpaceDbView; fields: Field[]; onView: (p: Partial<SpaceDbView>) => void; editable: boolean }) {
  const sort = view.sorts?.[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<ArrowDownUp size={15} strokeWidth={1.8} />} aria-label="Sort" title="Sort" data-on={sort ? "true" : undefined} />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" className="w-[260px] p-1">
        {sort ? (
          <div className="flex items-center gap-1 p-1 type-body">
            <span className="flex-1 truncate">{fields.find((f) => f.key === sort.field)?.label ?? sort.field}</span>
            <Button variant="outline" disabled={!editable} onClick={() => onView({ sorts: [{ field: sort.field, direction: sort.direction === "asc" ? "desc" : "asc" }] })}>
              {sort.direction === "asc" ? "Ascending" : "Descending"}
            </Button>
            {editable ? (
              <Button variant="quiet" icon={<X size={14} />} aria-label="Remove sort" onClick={() => onView({ sorts: [] })} />
            ) : null}
          </div>
        ) : editable ? (
          <FieldList fields={fields} onPick={(key) => onView({ sorts: [{ field: key, direction: "asc" }] })} />
        ) : (
          <p className="p-2 type-body text-muted-foreground">No sorts</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NewButton({ onNew }: { onNew: () => void }) {
  return (
    <div className="spaces-db-new">
      <Button variant="quiet" onClick={onNew}>
        New
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="quiet" icon={<ChevronDown size={14} />} aria-label="Templates" />
        </PopoverTrigger>
        <PopoverContent surface="solid" align="end" className="w-[240px] p-1">
          <div className="px-2 py-1 type-secondary text-muted-foreground">Templates</div>
          <MenuRow icon={<FileText size={15} />} label="Empty page" onClick={onNew} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

const CHART_TYPES: Array<{ id: ChartSettings["type"]; label: string; icon: typeof PieChart }> = [
  { id: "bar", label: "Vertical bar", icon: ChartNoAxesColumn },
  { id: "hbar", label: "Horizontal bar", icon: BarChart3 },
  { id: "line", label: "Line", icon: GanttChart },
  { id: "donut", label: "Donut", icon: PieChart },
];
const OPS: Array<{ id: ChartSettings["op"]; label: string }> = [
  { id: "count", label: "Count" },
  { id: "sum", label: "Sum" },
  { id: "avg", label: "Average" },
  { id: "min", label: "Min" },
  { id: "max", label: "Max" },
];

function ViewSettings({
  view,
  fields,
  props,
  onView,
  onBlock,
  editable,
  compact,
}: {
  view: SpaceDbView;
  fields: Field[];
  props: DatabaseBlockProps;
  onView: (p: Partial<SpaceDbView>) => void;
  onBlock: (p: Partial<DatabaseBlockProps>) => void;
  editable: boolean;
  compact?: boolean;
}) {
  const [page, setPage] = useState<"main" | "layout" | "group" | "x" | "yfield" | "props">("main");
  const chart = { ...DEFAULT_CHART, ...view.chart };
  const setChart = (p: Partial<ChartSettings>) => onView({ chart: { ...chart, ...p } });
  const label = (key?: string | null) => (key ? (fields.find((f) => f.key === key)?.label ?? key) : "None");
  return (
    <Popover onOpenChange={(o) => (o ? setPage("main") : null)}>
      <PopoverTrigger asChild>
        <button type="button" className={compact ? "spaces-db-icon spaces-db-icon-sm" : "spaces-db-icon"} aria-label="View settings" title="View settings">
          <SlidersHorizontal size={compact ? 13 : 15} strokeWidth={1.8} />
        </button>
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" className="w-[280px] p-1">
        {page === "main" ? (
          <>
            <div className="px-2 py-1 type-secondary text-muted-foreground">View options</div>
            <MenuRow icon={<Table2 size={15} />} label="Layout" end={<span className="type-secondary text-muted-foreground">{LAYOUTS.find((l) => l.id === view.layout)?.label}</span>} onClick={() => editable && setPage("layout")} />
            {view.layout !== "chart" ? <MenuRow icon={<List size={15} />} label="Properties" end={<span className="text-xs text-muted-foreground">{fields.length - (view.hiddenFields ?? []).filter((k) => fields.some((f) => f.key === k)).length} shown</span>} onClick={() => setPage("props")} /> : null}
            {view.layout === "kanban" ? <MenuRow icon={<Kanban size={15} />} label="Group" end={<span className="type-secondary text-muted-foreground">{label(view.groupField)}</span>} onClick={() => editable && setPage("group")} /> : null}
            {view.layout === "chart" ? (
              <>
                <div className="px-2 pt-2 pb-1 type-secondary text-muted-foreground">Chart type</div>
                <div className="grid grid-cols-4 gap-1 px-1">
                  {CHART_TYPES.map((t) => (
                    <button key={t.id} type="button" className="spaces-db-charttype" data-active={chart.type === t.id ? "true" : undefined} title={t.label} aria-label={t.label} disabled={!editable} onClick={() => setChart({ type: t.id })}>
                      <t.icon size={16} />
                    </button>
                  ))}
                </div>
                <MenuRow label={chart.type === "donut" ? "Show each" : "X axis"} end={<span className="type-secondary text-muted-foreground">{label(chart.groupBy)}</span>} onClick={() => editable && setPage("x")} />
                <div className="px-2 pt-2 pb-1 type-secondary text-muted-foreground">{chart.type === "donut" ? "Value" : "Y axis"}</div>
                <div className="flex flex-wrap gap-1 px-1 pb-1">
                  {OPS.map((o) => (
                    <Button variant="quiet" key={o.id} data-active={chart.op === o.id ? "true" : undefined} disabled={!editable} onClick={() => (o.id === "count" ? setChart({ op: "count", field: null }) : (setChart({ op: o.id }), setPage("yfield")))}>
                      {o.label}
                    </Button>
                  ))}
                </div>
                {chart.op !== "count" ? <MenuRow label="Of" end={<span className="type-secondary text-muted-foreground">{label(chart.field)}</span>} onClick={() => editable && setPage("yfield")} /> : null}
                <MenuRow label="Sort" end={<span className="type-secondary text-muted-foreground">{chart.sort === "asc" ? "Ascending" : chart.sort === "desc" ? "Descending" : "Manual"}</span>} onClick={() => editable && setChart({ sort: chart.sort === "asc" ? "desc" : chart.sort === "desc" ? "manual" : "asc" })} />
                {chart.type === "donut" ? <MenuRow label="Value in center" end={<Switch checked={chart.centerValue !== false} tabIndex={-1} aria-hidden />} onClick={() => editable && setChart({ centerValue: chart.centerValue === false })} /> : null}
                <MenuRow label="Legend" end={<Switch checked={Boolean(chart.legend)} tabIndex={-1} aria-hidden />} onClick={() => editable && setChart({ legend: !chart.legend })} />
                <MenuRow label="Data labels" end={<Switch checked={Boolean(chart.dataLabels)} tabIndex={-1} aria-hidden />} onClick={() => editable && setChart({ dataLabels: !chart.dataLabels })} />
              </>
            ) : null}
            {view.layout !== "chart" ? (
              <>
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
          </>
        ) : null}
        {page === "layout"
          ? LAYOUTS.map((l) => (
              <MenuRow
                key={l.id}
                icon={<l.icon size={15} />}
                label={l.label}
                active={view.layout === l.id}
                onClick={() => {
                  onView({ layout: l.id as SpaceViewLayout, name: view.name === LAYOUTS.find((x) => x.id === view.layout)?.label ? l.label : view.name });
                  setPage("main");
                }}
              />
            ))
          : null}
        {page === "props"
          ? fields.map((f) => {
              const hidden = (view.hiddenFields ?? []).includes(f.key);
              return (
                <MenuRow
                  key={f.key}
                  label={f.label}
                  end={<Switch checked={!hidden} tabIndex={-1} aria-hidden />}
                  onClick={() => editable && onView({ hiddenFields: hidden ? (view.hiddenFields ?? []).filter((k) => k !== f.key) : [...(view.hiddenFields ?? []), f.key] })}
                />
              );
            })
          : null}
        {page === "group" ? <FieldList fields={fields} value={view.groupField} onPick={(k) => (onView({ groupField: k }), setPage("main"))} /> : null}
        {page === "x" ? <FieldList fields={fields} value={chart.groupBy} onPick={(k) => (setChart({ groupBy: k }), setPage("main"))} /> : null}
        {page === "yfield" ? (
          <FieldList fields={fields} value={chart.field} filter={(f) => ["number", "currency", "percent", "rating", "integer"].includes(kindOf(f))} onPick={(k) => (setChart({ field: k }), setPage("main"))} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function RecordOpen({ tableId, recordId, as, onClose }: { tableId: string; recordId: string; as: "side" | "center" | "page"; onClose: () => void }) {
  if (as === "side") {
    return (
      <aside className="spaces-peek-side" aria-label="Side peek">
        <div className="spaces-peek-bar">
          <Button variant="quiet" icon={<X size={16} />} aria-label="Close" onClick={onClose} />
        </div>
        <div className="spaces-peek-body">
          <Peek tableId={tableId} recordId={recordId} onClose={onClose} />
        </div>
      </aside>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className={as === "page" ? "max-w-[100vw] w-[100vw] h-[100dvh] rounded-none overflow-auto" : "max-w-[860px] w-[92vw] max-h-[86dvh] overflow-auto"}>
        <DialogTitle className="sr-only">Record</DialogTitle>
        <Peek tableId={tableId} recordId={recordId} onClose={onClose} onPage={as === "page"} />
      </DialogContent>
    </Dialog>
  );
}
