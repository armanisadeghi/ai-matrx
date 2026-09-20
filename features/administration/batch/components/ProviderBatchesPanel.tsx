"use client";

/**
 * One row per provider submission: the ledger entry the flusher writes when
 * it groups N work items into a single provider Batch API call.
 *
 * What an operator comes here to answer: did this submission land, how long
 * did the provider take, how many polls did it cost us, was it escalated or
 * cancelled, and what did the grouping actually save.
 */
import { useState } from "react";
import { ListFilter, PackageOpen } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Button } from "@/components/ui/button";
import { JsonTreeViewer } from "@/components/official/json-explorer/JsonTreeViewer";
import { cn } from "@/lib/utils";
import { num, type ProviderBatch } from "../service/batchAdminService";
import {
  CostCell,
  StatusBadge,
  fmtInt,
  fmtSpan,
  fmtStamp,
  fmtUsd,
} from "./presentation";

/** `escalation_state` is NULL on every batch that never needed rescuing. */
function escalationLabel(row: ProviderBatch): string {
  if (row.cancel_requested_at) return "cancel requested";
  if (row.escalation_state) return row.escalation_state;
  return "—";
}

export function turnaroundSeconds(row: ProviderBatch): number | null {
  if (!row.submitted_at || !row.completed_at) return null;
  const submittedAt = Date.parse(row.submitted_at);
  const completedAt = Date.parse(row.completed_at);
  if (Number.isNaN(submittedAt) || Number.isNaN(completedAt)) return null;
  return (completedAt - submittedAt) / 1000;
}

export const providerBatchesUrlState = {
  id: "provider-batches",
  defaultSort: { id: "submitted_at", direction: "desc" as const },
  // Cross-tab focus is an explicit caller intent, never a stale row query.
  selectedRow: false,
};

export function ProviderBatchesPanel({
  batches,
  loading,
  error,
  focusId,
  onShowItems,
}: {
  batches: ProviderBatch[] | null;
  loading: boolean;
  error: string | null;
  /** A submission another panel asked to open — expanded on arrival. */
  focusId: string | null;
  /** Narrow the items tab to what this submission carried. */
  onShowItems: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A new focus request from the items tab opens that row; adjusting state
  // during render (not in an effect) is React's documented shape for "derive
  // from a prop change" and avoids the extra committed frame.
  const [seenFocus, setSeenFocus] = useState<string | null>(null);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (focusId) setSelectedId(focusId);
  }

  if (loading) {
    return (
      <section className="space-y-2 rounded-lg border border-border bg-card p-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-4 text-xs text-destructive">
        <p className="font-semibold">The provider batches could not be read.</p>
        <p className="mt-1 font-mono">{error}</p>
      </section>
    );
  }

  if (!batches || batches.length === 0) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-12 text-center">
        <PackageOpen className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          No provider batch has been submitted
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          The flusher groups queued work by provider, model and cached prefix,
          then sends one provider batch per group. With an empty queue there is
          nothing to group — this stays empty until background work is enqueued.
        </p>
      </section>
    );
  }

  const columns: MatrxColumnDef<ProviderBatch>[] = [
    { id: "submitted_at", accessorKey: "submitted_at", header: "Submitted", width: 145, cell: (row) => <span className="text-muted-foreground">{fmtStamp(row.submitted_at)}</span> },
    { id: "purpose", accessorKey: "purpose", header: "Purpose", width: 180, cell: (row) => <span className="font-medium">{row.purpose}</span> },
    { id: "model", header: "Model", accessorFn: (row) => `${row.model ?? ""} ${row.provider}`, width: 180, cell: (row) => <div><div>{row.model ?? "—"}</div><div className="text-[10px] text-muted-foreground">{row.provider}</div></div> },
    { id: "status", accessorKey: "status", header: "Status", filter: "select", width: 120, cell: (row) => <StatusBadge status={row.status} /> },
    { id: "request_count", accessorKey: "request_count", header: "Items", filter: "number", width: 90, cell: (row) => <span className="tabular-nums">{fmtInt(row.request_count)}</span> },
    { id: "poll_count", accessorKey: "poll_count", header: "Polls", filter: "number", width: 85, cell: (row) => <span className="tabular-nums text-muted-foreground">{fmtInt(row.poll_count)}</span> },
    { id: "turnaround", header: "Turnaround", accessorFn: turnaroundSeconds, filter: "number", width: 120, cell: (row) => <span className="tabular-nums text-muted-foreground">{fmtSpan(row.submitted_at, row.completed_at)}</span> },
    { id: "escalation", header: "Escalation", accessorFn: escalationLabel, width: 145, cell: (row) => <span className="text-muted-foreground">{escalationLabel(row)}</span> },
    { id: "cost", header: "Cost", accessorFn: (row) => num(row.cost_usd) ?? num(row.est_live_cost_usd) ?? 0, filter: "number", width: 110, cell: (row) => <CostCell actual={num(row.cost_usd)} liveEquivalent={row.live_equivalent_cost_usd === null ? null : num(row.live_equivalent_cost_usd)} estimate={num(row.est_live_cost_usd)} settled={row.status === "completed"} /> },
  ];

  return (
    <MatrxDataTable
      urlState={providerBatchesUrlState}
      data={batches}
      columns={columns}
      getRowId={(row) => row.id}
      selectedId={selectedId}
      onSelectedIdChange={setSelectedId}
      pageSize={25}
      emptyState={{ title: "No provider batch has been submitted" }}
      toolbar={{ search: true, searchPlaceholder: "Search provider batches…" }}
      rowClassName={(row) => cn((row.status === "failed" || row.status === "expired") && "bg-destructive/5")}
      detail={{ title: (row) => row.purpose, description: (row) => `Submitted ${fmtStamp(row.submitted_at)}`, render: (row) => <ProviderBatchDetail row={row} onShowItems={onShowItems} /> }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="truncate font-mono text-[11px] text-foreground">{children}</div>
    </div>
  );
}

function ProviderBatchDetail({
  row,
  onShowItems,
}: {
  row: ProviderBatch;
  onShowItems: (id: string) => void;
}) {
  const estBatch = num(row.est_cost_usd);
  const actual = num(row.cost_usd);
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          onShowItems(row.id);
        }}
      >
        <ListFilter className="mr-1.5 h-3.5 w-3.5" />
        Show its {fmtInt(row.request_count)}{" "}
        {row.request_count === 1 ? "work item" : "work items"}
      </Button>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Provider batch id">{row.batch_id ?? "not assigned"}</Field>
        <Field label="Prefix group">{row.prefix_group_key}</Field>
        <Field label="Created">{fmtStamp(row.created_at)}</Field>
        <Field label="Completed">{fmtStamp(row.completed_at)}</Field>

        <Field label="Last polled">{fmtStamp(row.last_polled_at)}</Field>
        <Field label="Next poll">{fmtStamp(row.next_poll_at)}</Field>
        <Field label="Escalation requested">
          {fmtStamp(row.escalation_requested_at)}
        </Field>
        <Field label="Cancel requested">{fmtStamp(row.cancel_requested_at)}</Field>

        <Field label="Tokens in / out">
          {fmtInt(row.tokens_in)} / {fmtInt(row.tokens_out)}
        </Field>
        <Field label="Cache read / write">
          {fmtInt(row.cache_read_tokens)} / {fmtInt(row.cache_write_tokens)}
        </Field>
        <Field label="Billed / live-equivalent">
          {fmtUsd(actual)} /{" "}
          {row.live_equivalent_cost_usd === null
            ? "not recorded"
            : fmtUsd(num(row.live_equivalent_cost_usd))}
        </Field>
        <Field label="Pre-submission estimate: batch / live">
          {fmtUsd(estBatch)} / {fmtUsd(num(row.est_live_cost_usd))}
        </Field>
      </div>

      {row.error ? (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-destructive">
            Batch error
          </p>
          <JsonTreeViewer data={row.error} />
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No error was recorded on this submission.
        </p>
      )}
    </div>
  );
}
