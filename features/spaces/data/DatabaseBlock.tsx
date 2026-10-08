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
import { ConditionGroup, DashboardCanvas, FieldEditor, FormBuilder, FormLookFrame, NotifyRuleEditor, Peek, RecordForm, ViewSwitcher, type ConditionField } from "@ai-matrx/records-ui";
import type { PublicForm } from "@/features/forms/service";
import { PublicFormRunner } from "@/app/(link)/f/[formId]/PublicFormRunner";
import { spacesFormForAnswering } from "./form-actions";
import { AutomationsPanel } from "./Automations";
import type { RuleExpression } from "@ai-matrx/records";
import { useFields, useRecordsClient, useTable, type Field } from "@ai-matrx/records/react";
import {
  ArrowDownUp,
  ArrowUpRight,
  BarChart3,
  Calendar,
  ChartNoAxesColumn,
  ClipboardList,
  Database,
  GalleryHorizontalEnd,
  GanttChart,
  Kanban,
  LayoutDashboard,
  List,
  ListFilter,
  Maximize2,
  PanelRight,
  Pencil,
  Zap,
  PieChart,
  Plus,
  Search,
  Square,
  SlidersHorizontal,
  Table2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { DataMount } from "./DataMount";
import { usePublishedEntities, usePublishedRows } from "./published-rows";
import { EntityDatabase } from "./EntityDatabase";
import { useDatabaseDesigner } from "../ai/DatabaseDesigner";
import { AutofillRows } from "./ai-autofill";
import { designMarkdown } from "./designed-database";
import { FieldList, MenuRow, SidePeek, ViewerSaveBar, ViewerSortButton, ViewTab, filtersDiffer, shownFilters, shownSorts, type FilterChoice, type SortChoice, NewButton } from "./menu-parts";
import { ChartView, choicesOfField } from "./ChartView";
import { DEFAULT_CHART } from "./first-reads";
import { kindOf, scalarFilters, viewSpec, type ViewWithSummaries } from "./view-spec";
import { BlockRecordsSeed } from "../page/space-seed-context";
import { NewPropertyPanel } from "./NewProperty";
import { SpaceIcon } from "../page/SpaceIcon";
import { useStructureEdit } from "../page/structure";
import { AGENCY_SAMPLE_ID, newViewId, readDatabaseProps, type ChartSettings, type DatabaseBlockProps, type SpaceDbView, type SpaceViewLayout } from "./sources";

type Layout = SpaceViewLayout | "dashboard" | "form";

const LAYOUTS: Array<{ id: Layout; label: string; icon: typeof Table2 }> = [
  { id: "grid", label: "Table", icon: Table2 },
  { id: "kanban", label: "Board", icon: Kanban },
  { id: "gallery", label: "Gallery", icon: GalleryHorizontalEnd },
  { id: "list", label: "List", icon: List },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "timeline", label: "Timeline", icon: GanttChart },
  { id: "chart", label: "Chart", icon: PieChart },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "form", label: "Form", icon: ClipboardList },
];

/** A view's icon: any Lucide name it stores ("DollarSign", "UserX") through SpaceIcon (DynamicIcon past the
 *  curated set), else its layout's glyph. */
function viewIcon(view: SpaceDbView, size: number): ReactNode {
  if (view.icon) return <SpaceIcon media={{ icon: view.icon }} size={size} />;
  const Icon = LAYOUTS.find((l) => l.id === view.layout)?.icon ?? Table2;
  return <Icon size={size} strokeWidth={1.8} />;
}

export interface DatabaseBlockViewProps {
  blockId: string;
  props: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  editable: boolean;
}

export function DatabaseBlock({ blockId, props: raw, onChange, editable }: DatabaseBlockViewProps) {
  const props = readDatabaseProps(raw);
  const publishedEntities = usePublishedEntities();
  if (!props) return <div className="spaces-db-frame spaces-db-note">This database has no source.</div>;
  if (props.source.kind === "entity") {
    // A page on the web: the rows the page itself published for this block, never a live read.
    const published = publishedEntities?.get(blockId);
    if (publishedEntities && !published) return <div className="spaces-db-frame spaces-db-note">This database isn’t published with this page.</div>;
    return <EntityDatabase token={props.source.token} props={props} raw={raw} onChange={onChange} editable={editable} published={published} />;
  }
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
      <BlockRecordsSeed>
        <DatabaseFrame tableId={tableId} props={props} raw={raw} onChange={onChange} editable={editable} sample={props.sample === AGENCY_SAMPLE_ID} />
      </BlockRecordsSeed>
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
  // Structure (views, properties, layout, automations, saved filters) is Full access / Can edit only (Notion);
  // a content editor adds and edits rows. The database enforces it; this only stops offering it.
  const structure = useStructureEdit();
  const shape = editable && structure;
  // On a page published to the web the rows are the page's own read-only copy: no automations, charts count rows.
  const published = usePublishedRows() !== null;
  const fields = useFields(tableId).data ?? [];
  const sourceName = table.data?.name ?? props.title ?? "Untitled";
  const views: SpaceDbView[] = props.views?.length ? props.views : [{ id: "view-all", name: "All", layout: "grid" }];
  const active = views.find((v) => v.id === props.activeViewId) ?? views[0];
  const [open, setOpen] = useState<string | null>(null);
  /** The row "+ New" just made: its peek opens with the cursor in its title. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // The toolbar sort is this viewer's own, per view, never written to the view (Notion): it reaches the
  // grid as `sortOverride` (null = the view's saved sort); charts and boards read it from the spec.
  const [sortChoices, setSortChoices] = useState<Record<string, SortChoice>>({});
  const choice = sortChoices[active.id];
  // The toolbar filter is the viewer's own the same way, until an editor saves it for everyone.
  const [filterChoices, setFilterChoices] = useState<Record<string, FilterChoice>>({});
  const shown: SpaceDbView = { ...active, sorts: shownSorts(active, choice), filters: shownFilters(active, filterChoices[active.id]) };
  const sortOverride = choice ?? null;
  // The viewer's search (the table's magnifier), per view, beside the sort and filter: never saved,
  // asked of the store's search by the grid (records-ui searchOverride).
  const [searchChoices, setSearchChoices] = useState<Record<string, string>>({});
  const [searchOpen, setSearchOpen] = useState<Record<string, boolean>>({});
  const search = {
    value: searchChoices[active.id] ?? "",
    onChange: (term: string) => setSearchChoices((prev) => (prev[active.id] === term ? prev : { ...prev, [active.id]: term })),
  };

  const save = (patch: Partial<DatabaseBlockProps>) => onChange({ ...raw, ...patch });
  const saveView = (patch: Partial<SpaceDbView>) => save({ views: views.map((v) => (v.id === active.id ? { ...v, ...patch } : v)), activeViewId: active.id });
  const isChart = active.layout === "chart";

  // "+ New page" (F7): Notion adds a row in place and opens it. A refused empty row (a required
  // column, a read-only sample) falls back to the whole-record form, which says why.
  const addRow = () => {
    void client.recordWrite({ table_id: tableId, data: {} }).then((res) => {
      if (res.ok) {
        setFresh(res.data);
        setOpen(res.data);
      } else if (sample) toast.info("The sample is read-only. Add your own table to add rows.");
      else setCreating(true);
    });
  };

  const body = (
    <DatabaseBody
      tableId={tableId}
      view={shown}
      fields={fields}
      onOpenRecord={setOpen}
      editable={editable}
      sample={sample}
      overRows={sample || published}
      sortOverride={sortOverride}
      search={search}
      shape={shape}
      onSummaries={shape && !sample && !published ? (summaries) => saveView({ summaries } as Partial<SpaceDbView>) : undefined}
      onFormId={(formId) => saveView({ formId })}
      onLook={saveView}
    />
  );

  return (
    <div className="spaces-db-frame" data-layout={active.layout}>
      {props.showTitle !== false && !isChart ? (
        <div className="spaces-db-title">
          {props.linked ? <ArrowUpRight size={14} strokeWidth={2} className="spaces-db-linked" /> : null}
          {shape && !sample ? (
            // Notion: the database's title is typed in place.
            <Input
              variant="bare"
              key={props.title || sourceName}
              defaultValue={props.title || sourceName}
              aria-label="Database title"
              className="spaces-db-title-input"
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== (props.title || sourceName)) save({ title: next });
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            />
          ) : (
            <span>{props.title || sourceName}</span>
          )}
        </div>
      ) : null}
      <div className="spaces-db-bar">
        <div className="spaces-db-tabs" role="tablist">
          {views.map((v) => {

            return (
              <ViewTab
                key={v.id}
                view={v}
                icon={viewIcon(v, isChart ? 16 : 14)}
                active={v.id === active.id}
                pill={isChart}
                editable={shape}
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
          {isChart && shape ? (
            <ViewSettings tableId={tableId} sample={sample} view={active} fields={fields} props={props} onView={saveView} onBlock={save} editable={shape} compact />
          ) : null}
          {isChart ? (
            // Notion's chart view keeps its view's filter and sort: the tile counts and orders what they show.
            <span className="spaces-db-chart-tools">
              <FilterButton
                view={active}
                fields={fields}
                choice={filterChoices[active.id]}
                onChoice={(c) => setFilterChoices((all) => ({ ...all, [active.id]: c }))}
                canSave={shape}
                onSave={(filters) => saveView({ filters })}
              />
              <ViewerSortButton
                view={active}
                fields={fields}
                choice={sortChoices[active.id]}
                onChoice={(c) => setSortChoices((all) => ({ ...all, [active.id]: c }))}
                canSave={shape}
                onSave={(sorts) => saveView({ sorts })}
                icon={<ArrowDownUp size={14} strokeWidth={1.8} />}
              />
            </span>
          ) : null}
          {shape && !isChart ? (
            <Button variant="quiet" icon={<Plus size={14} />} aria-label="Add view" onClick={() => {
                const v: SpaceDbView = { id: newViewId(), name: "Table", layout: "grid" };
                save({ views: [...views, v], activeViewId: v.id });
              }} />
          ) : null}
        </div>
        {!isChart ? (
          <div className="spaces-db-tools">
            <FilterButton
              view={active}
              fields={fields}
              choice={filterChoices[active.id]}
              onChoice={(c) => setFilterChoices((all) => ({ ...all, [active.id]: c }))}
              canSave={shape}
              onSave={(filters) => saveView({ filters })}
              onSaveWhere={shape && !sample && !published ? (where) => saveView({ where }) : undefined}
            />
            <ViewerSortButton
              view={active}
              fields={fields}
              choice={sortChoices[active.id]}
              onChoice={(c) => setSortChoices((all) => ({ ...all, [active.id]: c }))}
              canSave={shape}
              onSave={(sorts) => saveView({ sorts })}
              icon={<ArrowDownUp size={15} strokeWidth={1.8} />}
            />
            {published || !shape ? null : <AutomationsButton tableId={tableId} sample={sample} fields={fields} organizationId={(table.data as { organization_id?: string } | null)?.organization_id ?? null} />}
            {/* Notion's magnifier sits in this icon row and opens in place (records-ui's own box is hidden by spaces.css). */}
            {searchOpen[active.id] || search.value ? (
              <div className="spaces-db-search">
                <Search size={14} strokeWidth={1.8} aria-hidden />
                <Input
                  autoFocus
                  type="search"
                  aria-label="Search this database"
                  placeholder="Type to search…"
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      search.onChange("");
                      setSearchOpen((all) => ({ ...all, [active.id]: false }));
                    }
                  }}
                  onBlur={() => {
                    if (!search.value) setSearchOpen((all) => ({ ...all, [active.id]: false }));
                  }}
                />
                {search.value ? (
                  <Button
                    variant="quiet"
                    icon={<X size={13} />}
                    aria-label="Clear search"
                    onClick={() => {
                      search.onChange("");
                      setSearchOpen((all) => ({ ...all, [active.id]: false }));
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <Button variant="quiet" icon={<Search size={15} strokeWidth={1.8} />} aria-label="Search" title="Search" onClick={() => setSearchOpen((all) => ({ ...all, [active.id]: true }))} />
            )}
            <Button variant="quiet" icon={<Maximize2 size={15} strokeWidth={1.8} />} aria-label="Open as full page" title="Open as full page" onClick={() => setExpanded(true)} />
            {shape ? <ViewSettings tableId={tableId} sample={sample} view={active} fields={fields} props={props} onView={saveView} onBlock={save} editable={shape} /> : null}
            {published ? null : <NewButton onNew={addRow} />}
          </div>
        ) : null}
      </div>
      {body}

      {open ? <RecordOpen tableId={tableId} recordId={open} as={props.openAs ?? "side"} fresh={open === fresh} onClose={() => setOpen(null)} /> : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent size="lg">
          <DialogTitle>New {table.data?.name ? `in ${table.data.name}` : "page"}</DialogTitle>
          <RecordForm tableId={tableId} />
        </DialogContent>
      </Dialog>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent size="2xl" height="tall" className="spaces-db-expanded overflow-auto">
          <DialogTitle>{props.title || sourceName}</DialogTitle>
          <DatabaseBody tableId={tableId} view={shown} fields={fields} onOpenRecord={setOpen} editable={editable} shape={shape} sample={sample} overRows={sample || published} sortOverride={sortOverride} search={search} onSummaries={shape && !sample && !published ? (summaries) => saveView({ summaries } as Partial<SpaceDbView>) : undefined} onFormId={(formId) => saveView({ formId })} onLook={saveView} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DatabaseBody({
  tableId,
  view,
  fields,
  onOpenRecord,
  editable,
  shape,
  sample,
  overRows,
  sortOverride,
  search,
  onSummaries,
  onFormId,
  onLook,
}: {
  tableId: string;
  view: ViewWithSummaries;
  fields: Field[];
  onOpenRecord: (id: string) => void;
  editable: boolean;
  /** Full access / Can edit: the Form view's builder (a content editor, commenter or viewer answers it). */
  shape: boolean;
  sample: boolean;
  /** The store has no aggregate door (the sample, a published page): charts count read rows. */
  overRows: boolean;
  sortOverride: { field: string; direction: "asc" | "desc" } | null;
  search: { value: string; onChange: (term: string) => void };
  /** The person picked a column's footer measure (absent: nothing is kept — a reader, the sample). */
  onSummaries?: (summaries: Record<string, string>) => void;
  /** A Form view keeps the form it edits (made on first open). */
  onFormId: (formId: string) => void;
  /** The grid's column widths / order, kept on the view. */
  onLook: (look: Partial<SpaceDbView>) => void;
}) {
  if (view.layout === "chart") {
    const settings = { ...DEFAULT_CHART, ...view.chart };
    // The chart counts what its view shows: the view's saved filters plus the viewer's unsaved ones (`shown`).
    // and its sort when that sort is on the grouped field (data/ChartView.tsx orderPoints).
    return <ChartView tableId={tableId} settings={settings} title={view.name} overRows={overRows} filter={view.filters ?? {}} sorts={view.sorts ?? []} />;
  }
  if ((view.layout as Layout) === "dashboard") return <DashboardCanvas tableId={tableId} />;
  if ((view.layout as Layout) === "form") return <FormViewBody tableId={tableId} view={view} editable={shape && !overRows} onFormId={onFormId} />;
  const needsGroup = view.layout === "kanban" && !view.groupField;
  const group = needsGroup ? fields.find((f) => ["select", "status", "list"].includes(kindOf(f)))?.key : undefined;
  const needsDate = (view.layout === "calendar" || view.layout === "timeline") && !view.dateField;
  const date = needsDate ? fields.find((f) => ["datetime", "date"].includes(kindOf(f)))?.key : undefined;
  const spec = viewSpec(tableId, { ...view, groupField: view.groupField ?? group ?? null, dateField: view.dateField ?? date ?? null }, fields);
  // Notion's inline database: records-ui's embedded grid (no tick-boxes, Actions column or pager; one-line
  // rows; its own "New page" line, which writes the row in place). The magnifier is this block's own, in
  // its toolbar row beside filter and sort (searchBox={false}; N-19).
  return (
    <div className="spaces-db-body">
      <ViewSwitcher
        view={spec}
        chooser={false}
        embedded
        newRowLabel={editable ? "New page" : undefined}
        sortOverride={sortOverride}
        searchOverride={search.value || null}
        onSearchChange={search.onChange}
        searchBox={false}
        onOpenRecord={onOpenRecord}
        filter={view.filters && Object.keys(view.filters).length ? scalarFilters(view.filters) : undefined}
        onViewChange={
          onSummaries
            ? (patch) => {
                const next = patch.presentation?.summaries;
                if (next && JSON.stringify(next) !== JSON.stringify(view.summaries ?? {})) onSummaries(next);
                // N5: a dragged column width / order is the view's (Notion keeps both per view).
                const widths = patch.presentation?.widths;
                const columnOrder = patch.presentation?.columnOrder;
                const look: Partial<SpaceDbView> = {};
                if (widths && JSON.stringify(widths) !== JSON.stringify(view.widths ?? {})) look.widths = widths;
                if (columnOrder && JSON.stringify(columnOrder) !== JSON.stringify(view.columnOrder ?? [])) look.columnOrder = columnOrder;
                // N5 "Wrap column": present means these columns wrap; absent from a look patch means none do.
                const wrapColumns = patch.presentation ? (patch.presentation.wrapColumns ?? []) : undefined;
                if (wrapColumns && JSON.stringify(wrapColumns) !== JSON.stringify(view.wrapColumns ?? [])) look.wrapColumns = wrapColumns;
                if (Object.keys(look).length) onLook(look);
              }
            : undefined
        }
      />
    </div>
  );
}

/**
 * Notion's lightning (F3): the table's automations — records-ui's rule editor ("when a row …, tell …")
 * over this table, and the table's own page for the rest. The in-memory sample has no store to keep a
 * rule in, and says so.
 */
function AutomationsButton({ tableId, sample, fields, organizationId }: { tableId: string; sample: boolean; fields: Field[]; organizationId: string | null }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<Zap size={15} strokeWidth={1.8} />} aria-label="Automations" title="Automations" />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" width="md" padding="sm">
        {sample ? (
          <p className="type-secondary text-muted-foreground">This preview keeps no automations.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <AutomationsPanel tableId={tableId} organizationId={organizationId} fields={fields} />
            <NotifyRuleEditor tableId={tableId} />
            <a className="type-secondary text-muted-foreground underline-offset-2 hover:underline" href={`/data/${tableId}?rail=notifications`}>
              Open the table’s automations
            </a>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The toolbar filter (Notion): anyone may filter for themselves; an editor may save it for everyone. */
/**
 * N8 — Notion's Form view: the table's own form (records-ui FormBuilder over `custom.forms` /
 * `custom.form_declare`, the same form the public link `/f/<id>` answers): pick the properties asked,
 * each question's title, description and required, conditions, then publish and share the link.
 * An answer is a row of this table. The view keeps its form; the first open makes one.
 */
function FormViewBody({ tableId, view, editable, onFormId }: { tableId: string; view: SpaceDbView; editable: boolean; onFormId: (formId: string) => void }) {
  if (!editable) return <FormToAnswer formId={view.formId ?? null} />;
  return (
    <div className="spaces-db-body spaces-db-form">
      <FormBuilder
        tableId={tableId as never}
        activeFormId={(view.formId ?? null) as never}
        startWithOne={!view.formId}
        onActiveForm={(form) => {
          if (form.id && form.id !== view.formId) onFormId(String(form.id));
        }}
      />
    </div>
  );
}

/**
 * N8 — Notion: anyone who can open the page fills in the form. The form is the forms system's public
 * form (same door and same rule as its `/f/<id>` link); an answer is a row of this table.
 */
function FormToAnswer({ formId }: { formId: string | null }) {
  const [form, setForm] = useState<PublicForm | null | undefined>(formId ? undefined : null);
  useEffect(() => {
    if (!formId) return;
    let live = true;
    void spacesFormForAnswering(formId).then(
      (got) => live && setForm(got),
      () => live && setForm(null),
    );
    return () => {
      live = false;
    };
  }, [formId]);
  if (form === undefined) return <div className="spaces-db-body spaces-db-form" aria-busy="true" />;
  if (!form) return <div className="spaces-db-note">This form is not open for answers.</div>;
  if (form.state !== "open") return <div className="spaces-db-note">{form.message || "This form is closed."}</div>;
  return (
    <div className="spaces-db-body spaces-db-form" data-testid="spaces-form-answer">
      <FormLookFrame look={null} title={form.title}>
        <PublicFormRunner form={form} />
      </FormLookFrame>
    </div>
  );
}

/** How many rules a nested question holds (the Filter icon is "on" when any is). */
function conditionCount(expr: unknown): number {
  if (!expr || typeof expr !== "object" || Array.isArray(expr)) return 0;
  const node = expr as { op?: unknown; args?: unknown };
  if ((node.op === "and" || node.op === "or" || node.op === "not") && Array.isArray(node.args)) return node.args.reduce<number>((n, a) => n + conditionCount(a), 0);
  return 1;
}

/** Notion's advanced filter depth: a group, and a group inside it. */
const ADVANCED_FILTER_DEPTH = 2;

/**
 * N7 — Notion's advanced filter: rules joined by And / Or, filter groups two levels deep, saved with
 * the view. The builder is records-ui's one condition builder; the draft applies with one press.
 */
function AdvancedFilter({ view, fields, onSave, onClose }: { view: SpaceDbView; fields: Field[]; onSave?: (where: Record<string, unknown> | null) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<RuleExpression | null>((view.where ?? null) as RuleExpression | null);
  const conditionFields: ConditionField[] = fields.map((f) => ({ id: f.id, key: f.key, label: f.label || f.key, field: f }));
  const changed = JSON.stringify(draft) !== JSON.stringify(view.where ?? null);
  return (
    <div className="spaces-db-advanced" data-testid="spaces-advanced-filter">
      <ConditionGroup lead="Where" expr={draft} fields={conditionFields} onChange={setDraft} emptyLabel="every row" maxDepth={ADVANCED_FILTER_DEPTH} />
      {onSave ? (
        <div className="spaces-db-advanced-bar">
          <Button
            variant="quiet"
            onClick={() => {
              setDraft(null);
              onSave(null);
              onClose();
            }}
          >
            Delete filter
          </Button>
          <Button variant="primary" disabled={!changed} onClick={() => onSave(draft as unknown as Record<string, unknown> | null)}>
            Apply
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FilterButton({
  view,
  fields,
  choice,
  onChoice,
  canSave,
  onSave,
  onSaveWhere,
}: {
  view: SpaceDbView;
  fields: Field[];
  choice: FilterChoice;
  onChoice: (next: FilterChoice) => void;
  canSave: boolean;
  onSave: (filters: NonNullable<SpaceDbView["filters"]>) => void;
  /** Save the view's advanced filter (N7); left out, the advanced filter is read-only words. */
  onSaveWhere?: (where: Record<string, unknown> | null) => void;
}) {
  const [field, setField] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const filters = shownFilters(view, choice);
  const onView = (p: { filters: NonNullable<SpaceDbView["filters"]> }) => onChoice(p.filters);
  const count = Object.keys(filters).length + conditionCount(view.where);
  const showAdvanced = advanced || (!!view.where && !!onSaveWhere);
  return (
    <Popover onOpenChange={(o) => !o && setAdvanced(false)}>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={<ListFilter size={15} strokeWidth={1.8} />} aria-label="Filter" title="Filter" data-on={count ? "true" : undefined} />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" width={showAdvanced ? "xl" : "md"} padding={showAdvanced ? "sm" : "xs"}>
        {showAdvanced ? <AdvancedFilter view={view} fields={fields} onSave={onSaveWhere} onClose={() => setAdvanced(false)} /> : null}
        {showAdvanced ? null : Object.entries(filters).map(([k, v]) => (
          <MenuRow
            key={k}
            label={`${fields.find((f) => f.key === k)?.label ?? k} is ${String(v)}`}
            end={<X size={14} />}
            onClick={() => {
              const { [k]: _gone, ...rest } = filters;
              onView({ filters: rest });
            }}
          />
        ))}
        {showAdvanced ? null : (
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
            <>
              <FieldList fields={fields} onPick={setField} />
              {onSaveWhere ? <MenuRow icon={<Plus size={15} />} label="Add advanced filter" onClick={() => setAdvanced(true)} /> : null}
            </>
          )
        )}
        {filtersDiffer(view, choice) ? (
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
  tableId,
  sample,
  view,
  fields,
  props,
  onView,
  onBlock,
  editable,
  compact,
}: {
  tableId: string;
  sample: boolean;
  view: SpaceDbView;
  fields: Field[];
  props: DatabaseBlockProps;
  onView: (p: Partial<SpaceDbView>) => void;
  onBlock: (p: Partial<DatabaseBlockProps>) => void;
  editable: boolean;
  compact?: boolean;
}) {
  // N5 — Notion's property editor: the table's own column panel (records-ui FieldEditor: name, type,
  // choices and their colours, relation, number format, default, look) for one property or a new one.
  const [editing, setEditing] = useState<Field | "new" | null>(null);
  const canShape = editable && !sample;
  const designer = useDatabaseDesigner();
  const client = useRecordsClient();
  const table = useTable(tableId);
  const [page, setPage] = useState<"main" | "layout" | "group" | "x" | "yfield" | "props" | "newprop">("main");
  const chart = { ...DEFAULT_CHART, ...view.chart };
  const setChart = (p: Partial<ChartSettings>) => onView({ chart: { ...chart, ...p } });
  const label = (key?: string | null) => (key ? (fields.find((f) => f.key === key)?.label ?? key) : "None");
  return (
    <>
    <Dialog open={editing !== null} onOpenChange={(o) => (o ? null : setEditing(null))}>
      <DialogContent size="lg" className="overflow-auto">
        <DialogTitle>{editing === "new" ? "New property" : editing ? `Edit ${editing.label}` : "Property"}</DialogTitle>
        {editing !== null ? (
          <FieldEditor
            tableId={tableId}
            field={editing === "new" ? undefined : editing}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
            onRemoved={() => setEditing(null)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
    <Popover onOpenChange={(o) => (o ? setPage("main") : null)}>
      <PopoverTrigger asChild>
        <button type="button" className={compact ? "spaces-db-icon spaces-db-icon-sm" : "spaces-db-icon"} aria-label="View settings" title="View settings">
          <SlidersHorizontal size={compact ? 13 : 15} strokeWidth={1.8} />
        </button>
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" width="md" padding="xs">
        {page === "main" ? (
          <>
            <div className="px-2 py-1 type-secondary text-muted-foreground">View options</div>
            {editable ? (
              // Notion's view name (a chart tile's title is its view's name).
              <div className="px-2 pb-1">
                <Input key={view.id} defaultValue={view.name} aria-label="View name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== view.name && onView({ name: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
              </div>
            ) : null}
            <MenuRow icon={<Table2 size={15} />} label="Layout" end={<span className="type-secondary text-muted-foreground">{LAYOUTS.find((l) => l.id === view.layout)?.label}</span>} onClick={() => editable && setPage("layout")} />
            <MenuRow icon={<List size={15} />} label="Properties" end={<span className="text-xs text-muted-foreground">{fields.length - (view.hiddenFields ?? []).filter((k) => fields.some((f) => f.key === k)).length} shown</span>} onClick={() => setPage("props")} />
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
                {canShape ? (
                  <AutofillRows tableId={tableId} databaseName={props.title ?? "Database"} fields={fields} aiFields={props.aiFields ?? []} client={client} organizationId={(table.data as { organization_id?: string } | null)?.organization_id ?? null} onAiFields={(aiFields) => onBlock({ aiFields })} />
                ) : null}
                {canShape && designer.wired ? (
                  <MenuRow
                    icon={<AGENT_ICON size={15} />}
                    label="Redesign with AI"
                    onClick={() =>
                      void designer
                        .redesign({ spaceId: null, title: "", markdown: "", tableId, client, existingLabels: fields.map((f) => f.label), currentDesign: designMarkdown(props.title ?? "Database", fields, props.views ?? [view], []) })
                        .then((made) => made && onBlock({ views: made.views, activeViewId: made.views[0]?.id }))
                    }
                  />
                ) : null}
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
        {page === "props" ? (
          <>
            {fields.map((f) => {
              const hidden = (view.hiddenFields ?? []).includes(f.key);
              return (
                <div key={f.key} className="flex items-center">
                  <MenuRow
                    label={f.label}
                    end={<Switch checked={!hidden} tabIndex={-1} aria-hidden />}
                    onClick={() => editable && onView({ hiddenFields: hidden ? (view.hiddenFields ?? []).filter((k) => k !== f.key) : [...(view.hiddenFields ?? []), f.key] })}
                  />
                  {canShape ? <Button variant="quiet" icon={<Pencil size={14} />} aria-label={`Edit property ${f.label}`} title="Edit property" onClick={() => setEditing(f)} /> : null}
                </div>
              );
            })}
            {canShape ? <MenuRow icon={<Plus size={15} />} label="New property" onClick={() => setPage("newprop")} /> : null}
          </>
        ) : null}
        {page === "newprop" ? <NewPropertyPanel tableId={tableId} takenKeys={fields.map((f) => f.key)} onDone={() => setPage("props")} /> : null}
        {page === "group" ? <FieldList fields={fields} value={view.groupField} onPick={(k) => (onView({ groupField: k }), setPage("main"))} /> : null}
        {page === "x" ? <FieldList fields={fields} value={chart.groupBy} onPick={(k) => (setChart({ groupBy: k }), setPage("main"))} /> : null}
        {page === "yfield" ? (
          <FieldList fields={fields} value={chart.field} filter={(f) => ["number", "currency", "percent", "rating", "integer"].includes(kindOf(f))} onPick={(k) => (setChart({ field: k }), setPage("main"))} />
        ) : null}
      </PopoverContent>
    </Popover>
    </>
  );
}

function RecordOpen({ tableId, recordId, as, fresh, onClose }: { tableId: string; recordId: string; as: "side" | "center" | "page"; fresh: boolean; onClose: () => void }) {
  if (as === "side") {
    return (
      <SidePeek onClose={onClose} focusFirstField={fresh}>
        <Peek tableId={tableId} recordId={recordId} onClose={onClose} />
      </SidePeek>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent size={as === "page" ? "screen" : "xl"} className="overflow-auto">
        <DialogTitle className="sr-only">Record</DialogTitle>
        <Peek tableId={tableId} recordId={recordId} onClose={onClose} onPage={as === "page"} />
      </DialogContent>
    </Dialog>
  );
}
