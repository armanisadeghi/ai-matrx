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
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronRight, Inbox, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Skeleton } from "@ai-matrx/design-system";
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

export function WorkItemsPanel({
  statusFilter,
  handlerFilter,
  onStatusFilter,
  onHandlerFilter,
  refreshTick,
}: {
  statusFilter: string | null;
  handlerFilter: string | null;
  onStatusFilter: (s: string | null) => void;
  onHandlerFilter: (h: string | null) => void;
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

  const [facets, setFacets] = useState<{ purposes: string[]; providers: string[] }>({
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
    setLoading(true);
    setError(null);
    listWorkItems(
      {
        status: statusFilter,
        handler: handlerFilter,
        purpose,
        provider,
        search: debounced || null,
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
  }, [statusFilter, handlerFilter, purpose, provider, debounced, refreshTick]);

  const filtersActive =
    Boolean(statusFilter) ||
    Boolean(handlerFilter) ||
    Boolean(purpose) ||
    Boolean(provider) ||
    Boolean(debounced);

  const clearAll = () => {
    onStatusFilter(null);
    onHandlerFilter(null);
    setPurpose(null);
    setProvider(null);
    setSearch("");
  };

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
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
      chips.push({ key: "purpose", label: purpose, clear: () => setPurpose(null) });
    if (provider)
      chips.push({ key: "provider", label: provider, clear: () => setProvider(null) });
    if (debounced)
      chips.push({
        key: "search",
        label: `"${debounced}"`,
        clear: () => setSearch(""),
      });
    return chips;
  }, [statusFilter, handlerFilter, purpose, provider, debounced, onStatusFilter, onHandlerFilter]);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search custom id, target id, model"
            className="h-8 pl-7 text-xs"
          />
        </div>

        <FilterSelect
          value={statusFilter}
          onChange={onStatusFilter}
          placeholder="Any lifecycle"
          options={[...WORK_ITEM_STATUSES]}
        />
        <FilterSelect
          value={handlerFilter}
          onChange={onHandlerFilter}
          placeholder="Any delivery"
          options={[...HANDLER_STATUSES]}
          labelFor={(v) => DELIVERY[v]?.label ?? v}
        />
        <FilterSelect
          value={purpose}
          onChange={setPurpose}
          placeholder="Any purpose"
          options={facets.purposes}
        />
        <FilterSelect
          value={provider}
          onChange={setProvider}
          placeholder="Any provider"
          options={facets.providers}
        />

        {filtersActive && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAll}>
            Clear
          </Button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 p-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-6 text-xs text-destructive">
          <p className="font-semibold">The work items could not be read.</p>
          <p className="mt-1 font-mono">{error}</p>
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyItems filtersActive={filtersActive} onClear={clearAll} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-6" />
                  <th className="px-2 py-1.5 font-medium">Purpose</th>
                  <th className="px-2 py-1.5 font-medium">Model</th>
                  <th className="px-2 py-1.5 font-medium">Lifecycle</th>
                  <th className="px-2 py-1.5 font-medium">Delivery</th>
                  <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                  <th className="px-2 py-1.5 text-right font-medium">Age</th>
                  <th className="px-2 py-1.5 font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const open = expanded === row.id;
                  const undelivered =
                    row.status === "completed" && row.handler_status === "dead";
                  return (
                    <Fragment key={row.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : row.id)}
                        className={cn(
                          "cursor-pointer border-b border-border/60 align-middle hover:bg-accent/50",
                          open && "bg-accent/40",
                          undelivered && "bg-destructive/5",
                        )}
                      >
                        <td className="pl-2">
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground transition-transform",
                              open && "rotate-90",
                            )}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-medium text-foreground">{row.purpose}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {row.custom_id}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="text-foreground">{row.model}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {row.provider}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-2 py-1.5">
                          <DeliveryBadge handlerStatus={row.handler_status} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <CostCell
                            actual={num(row.actual_cost_usd)}
                            estLive={num(row.est_live_cost_usd)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                          {fmtAge(row.created_at)}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.link_kind && row.link_id ? (
                            <EntityRef
                              token={row.link_kind}
                              id={row.link_id}
                              name={`${row.link_kind} ${row.link_id.slice(0, 8)}`}
                              openInNewTab
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border">
                          <td colSpan={8} className="bg-muted/40 px-4 py-3">
                            <WorkItemDetail row={row} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              Showing {fmtInt(rows.length)} of {fmtInt(matched)} matching{" "}
              {matched === 1 ? "item" : "items"}
            </span>
            {truncated && (
              <span className="text-warning">
                Newest {WORK_ITEM_PAGE_SIZE} shown — narrow the filters to see the rest.
              </span>
            )}
          </footer>
        </>
      )}
    </section>
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

function EmptyItems({
  filtersActive,
  onClear,
}: {
  filtersActive: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" />
      {filtersActive ? (
        <>
          <p className="text-sm font-medium text-foreground">
            No work item matches these filters
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            The queue holds items — none of them look like this.
          </p>
          <Button variant="outline" size="sm" className="mt-1" onClick={onClear}>
            Clear filters
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">The queue is empty</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Nothing has been enqueued for batch processing. An idle queue is the
            normal resting state of this system — items appear here the moment a
            background job is submitted at batch pricing.
          </p>
        </>
      )}
    </div>
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
      <div className="truncate font-mono text-[11px] text-foreground">{children}</div>
    </div>
  );
}

function WorkItemDetail({ row }: { row: WorkItem }) {
  const delivery = deliveryOf(row.handler_status);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{delivery.hint}</p>

      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Enqueued">{fmtStamp(row.created_at)}</Field>
        <Field label="Submitted">{fmtStamp(row.submitted_at)}</Field>
        <Field label="Completed">{fmtStamp(row.completed_at)}</Field>
        <Field label="Queue wait">{fmtSpan(row.created_at, row.submitted_at)}</Field>
        <Field label="Provider turnaround">
          {fmtSpan(row.submitted_at, row.completed_at)}
        </Field>

        <Field label="Tokens in / out">
          {fmtInt(row.tokens_in)} / {fmtInt(row.tokens_out)}
        </Field>
        <Field label="Cache reads">
          {row.cache_read_tokens === null ? "not reported" : fmtInt(row.cache_read_tokens)}
        </Field>
        <Field label="Estimated in / out">
          {fmtInt(row.est_tokens_in)} / {fmtInt(row.est_tokens_out)}
        </Field>
        <Field label="Billed / live-equivalent">
          {fmtUsd(num(row.actual_cost_usd))} / {fmtUsd(num(row.est_live_cost_usd))}
        </Field>
        <Field label="Attempts">{fmtInt(row.attempt_count)}</Field>

        <Field label="Handler">{row.result_handler}</Field>
        <Field label="Urgency">{row.urgency}</Field>
        <Field label="Prefix group">{row.prefix_group_key}</Field>
        <Field label="Dedupe key">{row.dedupe_key ?? "—"}</Field>
        <Field label="Provider batch">{row.provider_batch_row_id ?? "not grouped yet"}</Field>

        {(row.deadline_at || row.escalated_at) && (
          <>
            <Field label="Deadline">{fmtStamp(row.deadline_at)}</Field>
            <Field label="Escalated">{fmtStamp(row.escalated_at)}</Field>
            <Field label="Escalation strategy">{row.escalation_strategy ?? "—"}</Field>
          </>
        )}
        {row.claimed_at && (
          <>
            <Field label="Claimed">{fmtStamp(row.claimed_at)}</Field>
            <Field label="Lease expires">{fmtStamp(row.lease_expires_at)}</Field>
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
