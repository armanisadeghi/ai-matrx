// Desktop suggestions manager: server-paginated canonical table.
"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  RotateCcw,
  Star,
  StickyNote,
  X,
} from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils/cn";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectKgRowMutation } from "@/lib/redux/slices/kgSuggestionsSlice";
import { ScopeGlyph } from "@/features/scopes/components/ScopeGlyph";
import { KgSuggestionRowItem } from "@/features/kg-suggestions/components/KgSuggestionRowItem";
import { SuggestionsFilterBar } from "@/features/kg-suggestions/components/manager/SuggestionsFilterBar";
import { useOpenSourcePreview } from "@/features/kg-suggestions/components/source-preview/SourcePreviewContext";
import {
  sourceKindLabel,
  sourceRefKey,
} from "@/features/kg-suggestions/service/sourcePreviewService";
import {
  isHeavyHitter,
  type KgAcceptResult,
  type KgEnrichedSuggestionRow,
  type KgSuggestionSortField,
  type KgSuggestionStatus,
  type KgSuggestionsQuery,
} from "@/features/kg-suggestions/types";
import { formatRelativeTime } from "@/utils/datetime";

const STATUS_STYLE: Record<KgSuggestionStatus, string> = {
  pending: "border-primary/40 text-primary",
  accepted: "border-success/40 text-success",
  rejected: "border-destructive/40 text-destructive",
  deferred: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  expired: "border-border text-muted-foreground",
};
const SERVER_SORT_FIELDS = new Set<KgSuggestionSortField>([
  "created_at",
  "confidence",
  "status",
  "scope_name",
  "item_label",
  "org_name",
]);

export interface SuggestionsTableProps {
  rows: KgEnrichedSuggestionRow[];
  total: number;
  loading: boolean;
  refresh: () => void;
  query: KgSuggestionsQuery;
  patchQuery: (patch: Partial<KgSuggestionsQuery>) => void;
  expandedId: string | null;
  onExpandedIdChange: (id: string | null) => void;
  selected: Set<string>;
  onSelectedChange: (ids: Set<string>) => void;
  sourceTitles: Map<string, string>;
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string, note?: string | null) => Promise<unknown>;
  defer: (id: string, note?: string | null) => Promise<unknown>;
  star: (id: string, starred: boolean) => Promise<void>;
  restore: (id: string) => Promise<void>;
}

export function SuggestionsTable(props: SuggestionsTableProps) {
  const {
    rows,
    total,
    loading,
    refresh,
    query,
    patchQuery,
    expandedId,
    onExpandedIdChange,
    selected,
    onSelectedChange,
    sourceTitles,
    accept,
    reject,
    defer,
    star,
    restore,
  } = props;
  const columns: MatrxColumnDef<KgEnrichedSuggestionRow>[] = [
    {
      id: "starred",
      header: "Starred",
      label: "Starred",
      accessorFn: (r) => r.is_starred,
      cell: (r) => <StarToggle row={r} star={star} />,
      sortable: false,
      filter: false,
      compact: true,
      width: 40,
      align: "center",
    },
    {
      id: "source",
      header: "Source file",
      accessorFn: (r) => sourceTitle(r, sourceTitles),
      cell: (r) => (
        <SourceCell
          row={r}
          sourceTitle={
            sourceTitles.get(sourceRefKey(r.source_kind, r.source_id)) ?? null
          }
        />
      ),
      sortable: false,
      filter: false,
      width: 230,
    },
    {
      id: "scope_type",
      header: "Type",
      accessorFn: (r) => r.scopeTypeLabel ?? "",
      cell: (r) => (
        <div className="flex items-center gap-1 text-muted-foreground">
          {r.scopeTypeIcon ? (
            <ScopeGlyph icon={r.scopeTypeIcon} className="h-3 w-3 shrink-0" />
          ) : null}
          <span className="max-w-[8rem] truncate">
            {r.scopeTypeLabel ?? "—"}
          </span>
        </div>
      ),
      sortable: false,
      filter: false,
      width: 135,
    },
    sortableColumn(
      "scope_name",
      "Scope",
      (r) => r.scopeName ?? "",
      (r) => <ScopeCell row={r} />,
      160,
    ),
    sortableColumn(
      "item_label",
      "Field",
      fieldLabel,
      (r) => (
        <span className="block max-w-[9rem] truncate text-foreground/90">
          {fieldLabel(r)}
        </span>
      ),
      145,
    ),
    {
      id: "suggested_value",
      header: "Proposed value",
      accessorKey: "suggested_value",
      cell: (r) => <ProposedValue row={r} />,
      sortable: false,
      filter: false,
      width: 210,
    },
    sortableColumn(
      "org_name",
      "Org",
      (r) => r.orgName ?? "",
      (r) => (
        <span className="block max-w-[8rem] truncate text-muted-foreground">
          {r.orgName ?? "—"}
        </span>
      ),
      125,
    ),
    sortableColumn(
      "confidence",
      "Conf.",
      (r) => r.confidence,
      (r) => <ConfidenceCell confidence={r.confidence} />,
      115,
    ),
    sortableColumn(
      "status",
      "Status",
      (r) => r.status,
      (r) => (
        <Badge
          variant="outline"
          className={cn(
            "h-4 px-1.5 text-[10px] capitalize",
            STATUS_STYLE[r.status],
          )}
        >
          {r.status}
        </Badge>
      ),
      105,
    ),
    sortableColumn(
      "created_at",
      "Detected",
      (r) => r.created_at,
      (r) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatRelativeTime(r.created_at, { style: "short" })}
        </span>
      ),
      125,
    ),
  ];
  const state: MatrxDataTableQueryState = {
    page: (query.page ?? 0) + 1,
    pageSize: query.pageSize ?? 50,
    search: query.search ?? "",
    anyOf: "",
    columnFilters: {},
    sort: {
      id: query.sortBy ?? "created_at",
      direction: query.sortDir ?? "desc",
    },
  };
  const onStateChange = (next: MatrxDataTableQueryState) => {
    const patch: Partial<KgSuggestionsQuery> = {};
    if (next.page !== state.page) patch.page = next.page - 1;
    if (next.pageSize !== state.pageSize) patch.pageSize = next.pageSize;
    if (
      next.sort &&
      SERVER_SORT_FIELDS.has(next.sort.id as KgSuggestionSortField)
    ) {
      patch.sortBy = next.sort.id as KgSuggestionSortField;
      patch.sortDir = next.sort.direction;
    }
    if (Object.keys(patch).length) patchQuery(patch);
  };
  const runBulk = async (
    label: string,
    ids: string[],
    operation: (id: string) => Promise<unknown>,
  ) => {
    if (!ids.length) return;
    const results = await Promise.allSettled(ids.map(operation));
    const failed = results.filter(
      (result) => result.status === "rejected",
    ).length;
    onSelectedChange(new Set());
    if (!failed) toast.success(`${label} ${ids.length} suggestion(s)`);
    else toast.error(`${label}: ${ids.length - failed} done, ${failed} failed`);
  };
  return (
    <MatrxDataTable<KgEnrichedSuggestionRow>
      tableId="knowledge-suggestions"
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      density="condensed"
      viewTabs={false}
      isLoading={loading && !rows.length}
      isFetching={loading && !!rows.length}
      query={{
        mode: "controlled",
        state,
        totalItems: total,
        onStateChange,
        sourceProcessing: {
          search: "source",
          sort: "source",
          sourceTotal: total,
        },
      }}
      toolbar={{
        search: false,
        leading: (
          <SuggestionsFilterBar
            query={query}
            patchQuery={patchQuery}
            rows={rows}
          />
        ),
        refresh: { onRefresh: refresh },
      }}
      selection={{
        selectedIds: [...selected],
        onSelectedIdsChange: (ids) => onSelectedChange(new Set(ids)),
        noun: "suggestion",
        actions: (_rows, ids) => (
          <div className="flex flex-wrap items-center gap-1">
            <BulkAction
              label="Accept"
              className="text-success hover:bg-success/10"
              onClick={() => void runBulk("Accepted", ids, accept)}
              icon={<Check className="h-3 w-3" />}
            />
            <BulkAction
              label="Defer"
              className="text-muted-foreground hover:bg-accent"
              onClick={() => void runBulk("Deferred", ids, defer)}
              icon={<Clock className="h-3 w-3" />}
            />
            <BulkAction
              label="Reject"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => void runBulk("Rejected", ids, reject)}
              icon={<X className="h-3 w-3" />}
            />
            <BulkAction
              label="Star"
              className="text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
              onClick={() =>
                void runBulk("Starred", ids, (id) => star(id, true))
              }
              icon={<Star className="h-3 w-3" />}
            />
          </div>
        ),
      }}
      expandedDetail={{
        expandedId,
        onExpandedIdChange,
        render: (row) => (
          <div className="max-w-3xl py-1">
            <KgSuggestionRowItem
              row={row}
              accept={accept}
              reject={reject}
              defer={defer}
            />
          </div>
        ),
      }}
      rowActions={(row, controls) => (
        <SuggestionActions
          row={row}
          expanded={controls.isExpanded ?? false}
          onToggleExpand={() => controls.toggleExpanded?.()}
          accept={accept}
          reject={reject}
          defer={defer}
          restore={restore}
        />
      )}
      copy={false}
      emptyState={{ title: "No suggestions match these filters." }}
      className="min-w-[72rem]"
    />
  );
}

function sortableColumn(
  id: KgSuggestionSortField,
  header: string,
  accessorFn: (row: KgEnrichedSuggestionRow) => unknown,
  cell: (row: KgEnrichedSuggestionRow) => React.ReactNode,
  width: number,
): MatrxColumnDef<KgEnrichedSuggestionRow> {
  return {
    id,
    header,
    accessorFn,
    cell,
    filter: false,
    defaultSortDirection: "desc",
    width,
  };
}
function sourceTitle(
  row: KgEnrichedSuggestionRow,
  titles: Map<string, string>,
) {
  return (
    titles.get(sourceRefKey(row.source_kind, row.source_id)) ??
    `Untitled ${sourceKindLabel(row.source_kind)}`
  );
}
function fieldLabel(row: KgEnrichedSuggestionRow) {
  return (
    row.itemLabel ??
    row.target.slot_name ??
    (row.stage === "association" ? "Scope link" : "—")
  );
}
function SourceCell({
  row,
  sourceTitle: title,
}: {
  row: KgEnrichedSuggestionRow;
  sourceTitle: string | null;
}) {
  const open = useOpenSourcePreview();
  const Icon = row.source_kind === "note" ? StickyNote : FileText;
  const label = title ?? `Untitled ${sourceKindLabel(row.source_kind)}`;
  const canPreview = !!row.source_id && !!open;
  return (
    <div>
      <button
        type="button"
        disabled={!canPreview}
        onClick={() =>
          open?.({
            kind: row.source_kind,
            id: row.source_id,
            snippet: row.context_snippet,
            title,
          })
        }
        title={canPreview ? `Preview ${label}` : label}
        className={cn(
          "group flex w-full items-center gap-1.5 text-left",
          canPreview && "cursor-pointer",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {label}
        </span>
        {canPreview ? (
          <Eye className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </button>
      {row.context_snippet ? (
        <div className="truncate pl-5 text-[10px] text-muted-foreground/80">
          “{row.context_snippet}”
        </div>
      ) : null}
    </div>
  );
}
function ScopeCell({ row }: { row: KgEnrichedSuggestionRow }) {
  return (
    <div className="flex items-center gap-1">
      {!row.viewed_at ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          aria-label="New"
        />
      ) : null}
      <span className="max-w-[10rem] truncate font-medium text-foreground">
        {row.scopeName ?? "—"}
      </span>
    </div>
  );
}
function StarToggle({
  row,
  star,
}: {
  row: KgEnrichedSuggestionRow;
  star: (id: string, starred: boolean) => Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => void star(row.id, !row.is_starred)}
      aria-label={row.is_starred ? "Unstar" : "Star"}
      className="text-muted-foreground transition-colors hover:text-amber-500"
    >
      <Star
        className={cn(
          "h-3.5 w-3.5",
          row.is_starred && "fill-amber-400 text-amber-500",
        )}
      />
    </button>
  );
}
function ProposedValue({ row }: { row: KgEnrichedSuggestionRow }) {
  return (
    <div>
      <div className="truncate font-mono text-foreground/90">
        {row.suggested_value ?? "—"}
      </div>
      {row.current_value_snapshot ? (
        <div className="truncate font-mono text-[10px] text-muted-foreground line-through">
          {row.current_value_snapshot}
        </div>
      ) : null}
    </div>
  );
}
function ConfidenceCell({ confidence }: { confidence: number }) {
  const percent = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  );
}
function SuggestionActions({
  row,
  expanded,
  onToggleExpand,
  accept,
  reject,
  defer,
  restore,
}: {
  row: KgEnrichedSuggestionRow;
  expanded: boolean;
  onToggleExpand: () => void;
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string, note?: string | null) => Promise<unknown>;
  defer: (id: string, note?: string | null) => Promise<unknown>;
  restore: (id: string) => Promise<void>;
}) {
  const mutation = useAppSelector((state) =>
    selectKgRowMutation(state, row.id),
  );
  const busy = mutation !== "idle";
  const pending = row.status === "pending";
  const quickAccept = pending && !isHeavyHitter(row);
  return (
    <div className="flex items-center justify-end gap-0.5">
      {quickAccept ? (
        <>
          <IconAction
            title="Accept"
            busy={busy}
            onClick={() => void accept(row.id)}
            className="text-success hover:bg-success/10"
          >
            <Check className="h-3.5 w-3.5" />
          </IconAction>
          <IconAction
            title="Defer 7 days"
            busy={busy}
            onClick={() => void defer(row.id)}
            className="text-muted-foreground hover:bg-accent"
          >
            <Clock className="h-3.5 w-3.5" />
          </IconAction>
          <IconAction
            title="Reject"
            busy={busy}
            onClick={() => void reject(row.id)}
            className="text-destructive hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5" />
          </IconAction>
        </>
      ) : !pending ? (
        <IconAction
          title="Restore to pending"
          busy={busy}
          onClick={() => void restore(row.id)}
          className="text-muted-foreground hover:bg-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </IconAction>
      ) : null}
      <IconAction
        title={expanded ? "Collapse" : "Expand"}
        busy={false}
        onClick={onToggleExpand}
        className="text-muted-foreground hover:bg-accent"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </IconAction>
    </div>
  );
}
function BulkAction({
  icon,
  label,
  className,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors",
        className,
      )}
    >
      {icon}
      {label}
    </button>
  );
}
function IconAction({
  title,
  busy,
  onClick,
  className,
  children,
}: {
  title: string;
  busy: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={busy}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded transition-colors disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
export default SuggestionsTable;
