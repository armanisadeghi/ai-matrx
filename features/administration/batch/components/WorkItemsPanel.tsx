"use client";

/**
 * The work-item ledger: one row per unit of AI work, filterable by the four
 * axes an operator actually reasons in (lifecycle, delivery, purpose,
 * provider) and expandable in place to the two jsonb columns that say WHY
 * something went wrong — `error` (the provider call) and `handler_error`
 * (the delivery).
 *
 * Row density and the expand-in-place gesture are modelled on Linear's issue
 * list; the money column is Stripe's (what it cost, what it would have cost,
 * the discount stated out loud).
 */
import { useEffect, useMemo, useState } from "react";
import { Inbox, Search, X } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableCoverageConfig,
} from "@ai-matrx/design-system/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JsonTreeViewer } from "@/components/official/json-explorer/JsonTreeViewer";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import {
  fetchWorkItemFacets,
  listWorkItems,
  num,
  type WorkItem,
  HANDLER_STATUSES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_PAGE_SIZE,
} from "../service/batchAdminService";
import {
  CostCell,
  DELIVERY,
  DeliveryBadge,
  StatusBadge,
  deliveryOf,
  fmtAge,
  fmtInt,
  fmtSpan,
  fmtStamp,
  fmtUsd,
} from "./presentation";

const ANY = "__any__";

/**
 * `listWorkItems` applies every displayed filter at the source, then returns
 * the newest bounded page plus the exact source-side match count. Do not pass
 * its fetch cap to MatrxDataTable's `cap`: that field means the FILTER searched
 * only a prefix, which is not true here. The source notice below carries the
 * distinct fact that this complete answer is represented by its newest page.
 */
export function workItemsCoverage(
  loaded: number,
  matched: number,
): MatrxDataTableCoverageConfig {
  return { loaded, matched, answeredBy: "source", noun: "work item" };
}

export function workItemsSourceNotice(
  loaded: number,
  matched: number,
  truncated: boolean,
): string {
  return truncated
    ? `Showing the newest ${fmtInt(loaded)} of ${fmtInt(matched)} matching work items. Narrow the filters to inspect the rest.`
    : `${fmtInt(matched)} matching ${matched === 1 ? "work item" : "work items"} returned by the source.`;
}

export function WorkItemsPanel({
  statusFilter,
  handlerFilter,
  onStatusFilter,
  onHandlerFilter,
  batchFilter,
  onBatchFilter,
  onOpenBatch,
  refreshTick,
}: {
  statusFilter: string | null;
  handlerFilter: string | null;
  onStatusFilter: (s: string | null) => void;
  onHandlerFilter: (h: string | null) => void;
  /** Narrow to the items one provider submission carried. */
  batchFilter: string | null;
  onBatchFilter: (id: string | null) => void;
  /** Jump to a provider submission on the batches tab. */
  onOpenBatch: (id: string) => void;
  refreshTick: number;
}) {
  const [purpose, setPurpose] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [rows, setRows] = useState<WorkItem[] | null>(null);
  const [matched, setMatched] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [facets, setFacets] = useState<{
    purposes: string[];
    providers: string[];
  }>({
    purposes: [],
    providers: [],
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    fetchWorkItemFacets({ signal: controller.signal })
      .then(setFacets)
      .catch(() => {
        // A facet list that cannot be read must not silence the table; the
        // selects simply stay at "Any" and the table below reports its own
        // error if the real read failed too.
      });
    return () => controller.abort();
  }, [refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    // This is a request-boundary reset, not derived render state: stale rows
    // must become a table loading state before the next source answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    listWorkItems(
      {
        status: statusFilter,
        handler: handlerFilter,
        purpose,
        provider,
        search: debounced || null,
        batchRowId: batchFilter,
      },
      { signal: controller.signal },
    )
      .then((page) => {
        setRows(page.items);
        setMatched(page.matched);
        setTruncated(page.truncated);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setRows(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    statusFilter,
    handlerFilter,
    purpose,
    provider,
    debounced,
    batchFilter,
    refreshTick,
  ]);

  const filtersActive =
    Boolean(statusFilter) ||
    Boolean(handlerFilter) ||
    Boolean(purpose) ||
    Boolean(provider) ||
    Boolean(debounced) ||
    Boolean(batchFilter);

  const clearAll = () => {
    onStatusFilter(null);
    onHandlerFilter(null);
    onBatchFilter(null);
    setPurpose(null);
    setProvider(null);
    setSearch("");
  };

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (batchFilter)
      chips.push({
        key: "batch",
        label: `submission ${batchFilter.slice(0, 8)}`,
        clear: () => onBatchFilter(null),
      });
    if (statusFilter)
      chips.push({
        key: "status",
        label: `lifecycle: ${statusFilter}`,
        clear: () => onStatusFilter(null),
      });
    if (handlerFilter)
      chips.push({
        key: "handler",
        label: `delivery: ${DELIVERY[handlerFilter]?.label ?? handlerFilter}`,
        clear: () => onHandlerFilter(null),
      });
    if (purpose)
      chips.push({
        key: "purpose",
        label: purpose,
        clear: () => setPurpose(null),
      });
    if (provider)
      chips.push({
        key: "provider",
        label: provider,
        clear: () => setProvider(null),
      });
    if (debounced)
      chips.push({
        key: "search",
        label: `"${debounced}"`,
        clear: () => setSearch(""),
      });
    return chips;
  }, [
    statusFilter,
    handlerFilter,
    purpose,
    provider,
    debounced,
    batchFilter,
    onStatusFilter,
    onHandlerFilter,
    onBatchFilter,
  ]);

  const columns = useMemo<MatrxColumnDef<WorkItem>[]>(
    () => [
      // The source returns a capped newest-first answer. Each field remains an
      // explicit column and accessor, but package-local sort/filter would lie
      // about the full source result until listWorkItems grows those contracts.
      {
        id: "purpose",
        accessorKey: "purpose",
        header: "Purpose",
        width: 190,
        filter: false,
        sortable: false,
        cell: (row) => (
          <div className="min-w-0">
            <div
              className="truncate font-medium text-foreground"
              title={row.purpose}
            >
              {row.purpose}
            </div>
            <div
              className="truncate font-mono text-[10px] text-muted-foreground"
              title={row.custom_id}
            >
              {/* custom_id is a provider trace key, not a platform entity. */}
              {/* eslint-disable-next-line matrx/no-bare-id-text */}
              {row.custom_id}
            </div>
          </div>
        ),
      },
      {
        id: "model",
        accessorKey: "model",
        header: "Model",
        width: 170,
        filter: false,
        sortable: false,
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate text-foreground" title={row.model}>
              {row.model}
            </div>
            <div
              className="truncate text-[10px] text-muted-foreground"
              title={row.provider}
            >
              {row.provider}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Lifecycle",
        width: 126,
        filter: false,
        sortable: false,
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: "delivery",
        header: "Delivery",
        accessorFn: (row) => row.handler_status ?? "none",
        width: 132,
        filter: false,
        sortable: false,
        cell: (row) => <DeliveryBadge handlerStatus={row.handler_status} />,
      },
      {
        id: "cost",
        header: "Cost",
        accessorFn: (row) => num(row.actual_cost_usd),
        width: 150,
        align: "right",
        filter: false,
        sortable: false,
        cell: (row) => (
          <CostCell
            actual={num(row.actual_cost_usd)}
            liveEquivalent={
              row.live_equivalent_cost_usd === null
                ? null
                : num(row.live_equivalent_cost_usd)
            }
            estimate={num(row.est_live_cost_usd)}
            settled={row.status === "completed"}
          />
        ),
      },
      {
        id: "age",
        header: "Age",
        accessorFn: (row) => row.created_at ?? "",
        width: 90,
        align: "right",
        filter: false,
        sortable: false,
        cell: (row) => (
          <span className="font-mono tabular-nums text-muted-foreground">
            {fmtAge(row.created_at)}
          </span>
        ),
      },
      {
        id: "target",
        header: "Target",
        accessorFn: (row) => row.link_id ?? "",
        width: 180,
        filter: false,
        sortable: false,
        cell: (row) =>
          row.link_kind && row.link_id ? (
            <EntityRef
              token={row.link_kind}
              id={row.link_id}
              name={`${row.link_kind} ${row.link_id.slice(0, 8)}`}
              openInNewTab
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  const sourceNotice = workItemsSourceNotice(
    rows?.length ?? 0,
    matched,
    truncated,
  );

  return (
    <MatrxDataTable<WorkItem>
      tableId="batch-work-items"
      data={rows ?? []}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={loading}
      pageSize={WORK_ITEM_PAGE_SIZE}
      hidePagination
      detail={{ enabled: false }}
      window={{ enabled: false }}
      expandedDetail={{
        expandedId: expanded,
        onExpandedIdChange: setExpanded,
        render: (row) => <WorkItemDetail row={row} onOpenBatch={onOpenBatch} />,
      }}
      rowClassName={(row) =>
        cn(
          row.status === "completed" &&
            row.handler_status === "dead" &&
            "bg-destructive/5",
        )
      }
      coverage={workItemsCoverage(rows?.length ?? 0, matched)}
      emptyState={
        error
          ? {
              title: "The work items could not be read.",
              description: error,
            }
          : {
              icon: <Inbox className="h-6 w-6 text-muted-foreground" />,
              title: filtersActive
                ? "No work item matches these filters"
                : "The queue is empty",
              description: filtersActive
                ? "The queue holds items — none of them look like this."
                : "Nothing has been enqueued for batch processing. Items appear here when a background job is submitted at batch pricing.",
              action: filtersActive ? (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : undefined,
            }
      }
      toolbar={{
        title: "Work items",
        customSearch: (
          <div className="relative min-w-[200px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search custom id, target id, model"
              className="h-8 pl-7 text-xs"
              aria-label="Search work items"
            />
          </div>
        ),
        actions: filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={clearAll}
          >
            Clear
          </Button>
        ) : undefined,
        facets: [
          {
            type: "custom",
            id: "lifecycle",
            filter: {
              active: Boolean(statusFilter),
              onReset: () => onStatusFilter(null),
            },
            render: () => (
              <FilterSelect
                value={statusFilter}
                onChange={onStatusFilter}
                placeholder="Any lifecycle"
                options={[...WORK_ITEM_STATUSES]}
              />
            ),
          },
          {
            type: "custom",
            id: "delivery",
            filter: {
              active: Boolean(handlerFilter),
              onReset: () => onHandlerFilter(null),
            },
            render: () => (
              <FilterSelect
                value={handlerFilter}
                onChange={onHandlerFilter}
                placeholder="Any delivery"
                options={[...HANDLER_STATUSES]}
                labelFor={(value) => DELIVERY[value]?.label ?? value}
              />
            ),
          },
          {
            type: "custom",
            id: "purpose",
            filter: {
              active: Boolean(purpose),
              onReset: () => setPurpose(null),
            },
            render: () => (
              <FilterSelect
                value={purpose}
                onChange={setPurpose}
                placeholder="Any purpose"
                options={facets.purposes}
              />
            ),
          },
          {
            type: "custom",
            id: "provider",
            filter: {
              active: Boolean(provider),
              onReset: () => setProvider(null),
            },
            render: () => (
              <FilterSelect
                value={provider}
                onChange={setProvider}
                placeholder="Any provider"
                options={facets.providers}
              />
            ),
          },
        ],
        leading: (
          <div className="space-y-2">
            {activeChips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.clear}
                    className="flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {chip.label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            ) : null}
            <p className={cn("text-xs", truncated && "text-warning")}>
              {sourceNotice}
            </p>
          </div>
        ),
      }}
    />
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  labelFor,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
  options: string[];
  labelFor?: (v: string) => string;
}) {
  return (
    <Select
      value={value ?? ANY}
      onValueChange={(v) => onChange(v === ANY ? null : v)}
    >
      <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY} className="text-xs">
          {placeholder}
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">
            {labelFor ? labelFor(o) : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="truncate font-mono text-[11px] text-foreground">
        {children}
      </div>
    </div>
  );
}

function WorkItemDetail({
  row,
  onOpenBatch,
}: {
  row: WorkItem;
  onOpenBatch: (id: string) => void;
}) {
  const delivery = deliveryOf(row.handler_status);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{delivery.hint}</p>

      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Enqueued">{fmtStamp(row.created_at)}</Field>
        <Field label="Submitted">{fmtStamp(row.submitted_at)}</Field>
        <Field label="Completed">{fmtStamp(row.completed_at)}</Field>
        <Field label="Queue wait">
          {fmtSpan(row.created_at, row.submitted_at)}
        </Field>
        <Field label="Provider turnaround">
          {fmtSpan(row.submitted_at, row.completed_at)}
        </Field>

        <Field label="Tokens in / out">
          {fmtInt(row.tokens_in)} / {fmtInt(row.tokens_out)}
        </Field>
        <Field label="Cache reads">
          {row.cache_read_tokens === null
            ? "not reported"
            : fmtInt(row.cache_read_tokens)}
        </Field>
        <Field label="Estimated in / out">
          {fmtInt(row.est_tokens_in)} / {fmtInt(row.est_tokens_out)}
        </Field>
        <Field label="Billed / live-equivalent">
          {fmtUsd(num(row.actual_cost_usd))} /{" "}
          {row.live_equivalent_cost_usd === null
            ? "not recorded"
            : fmtUsd(num(row.live_equivalent_cost_usd))}
        </Field>
        <Field label="Pre-submission estimate (live)">
          {fmtUsd(num(row.est_live_cost_usd))}
        </Field>
        <Field label="Attempts">{fmtInt(row.attempt_count)}</Field>

        <Field label="Handler">{row.result_handler}</Field>
        <Field label="Urgency">{row.urgency}</Field>
        <Field label="Prefix group">{row.prefix_group_key}</Field>
        <Field label="Dedupe key">{row.dedupe_key ?? "—"}</Field>
        <Field label="Provider batch">
          {row.provider_batch_row_id ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenBatch(row.provider_batch_row_id as string);
              }}
              className="underline decoration-dotted underline-offset-2 hover:text-primary"
              title="Open this submission on the Provider batches tab"
            >
              {row.provider_batch_row_id.slice(0, 8)} · open submission
            </button>
          ) : (
            "not grouped yet"
          )}
        </Field>

        {(row.deadline_at || row.escalated_at) && (
          <>
            <Field label="Deadline">{fmtStamp(row.deadline_at)}</Field>
            <Field label="Escalated">{fmtStamp(row.escalated_at)}</Field>
            <Field label="Escalation strategy">
              {row.escalation_strategy ?? "—"}
            </Field>
          </>
        )}
        {row.claimed_at && (
          <>
            <Field label="Claimed">{fmtStamp(row.claimed_at)}</Field>
            <Field label="Lease expires">
              {fmtStamp(row.lease_expires_at)}
            </Field>
          </>
        )}
      </div>

      {row.handler_error ? (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-destructive">
            Delivery error (handler_error)
          </p>
          <JsonTreeViewer data={row.handler_error} />
        </div>
      ) : null}

      {row.error ? (
        <div className="rounded border border-warning/40 bg-warning/5 p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-warning">
            Provider error (error)
          </p>
          <JsonTreeViewer data={row.error} />
        </div>
      ) : null}

      {!row.handler_error && !row.error && (
        <p className="text-[11px] text-muted-foreground">
          No error was recorded on this item.
        </p>
      )}
    </div>
  );
}
