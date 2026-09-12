"use client";

/**
 * One row per provider submission: the ledger entry the flusher writes when
 * it groups N work items into a single provider Batch API call.
 *
 * What an operator comes here to answer: did this submission land, how long
 * did the provider take, how many polls did it cost us, was it escalated or
 * cancelled, and what did the grouping actually save.
 */
import { Fragment, useState } from "react";
import { ChevronRight, ListFilter, PackageOpen } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
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
  const [expanded, setExpanded] = useState<string | null>(null);
  // A new focus request from the items tab opens that row; adjusting state
  // during render (not in an effect) is React's documented shape for "derive
  // from a prop change" and avoids the extra committed frame.
  const [seenFocus, setSeenFocus] = useState<string | null>(null);
  if (focusId !== seenFocus) {
    setSeenFocus(focusId);
    if (focusId) setExpanded(focusId);
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

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-6" />
              <th className="px-2 py-1.5 font-medium">Submitted</th>
              <th className="px-2 py-1.5 font-medium">Purpose</th>
              <th className="px-2 py-1.5 font-medium">Model</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 text-right font-medium">Items</th>
              <th className="px-2 py-1.5 text-right font-medium">Polls</th>
              <th className="px-2 py-1.5 text-right font-medium">Turnaround</th>
              <th className="px-2 py-1.5 font-medium">Escalation</th>
              <th className="px-2 py-1.5 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((row) => {
              const open = expanded === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => setExpanded(open ? null : row.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 hover:bg-accent/50",
                      open && "bg-accent/40",
                      row.status === "failed" || row.status === "expired"
                        ? "bg-destructive/5"
                        : undefined,
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
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {fmtStamp(row.submitted_at)}
                    </td>
                    <td className="px-2 py-1.5 font-medium text-foreground">
                      {row.purpose}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="text-foreground">{row.model ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {row.provider}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {fmtInt(row.request_count)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {fmtInt(row.poll_count)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {fmtSpan(row.submitted_at, row.completed_at)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {escalationLabel(row)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <CostCell
                        actual={num(row.cost_usd)}
                        estLive={num(row.est_live_cost_usd)}
                        settled={row.status === "completed"}
                      />
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-border">
                      <td colSpan={10} className="bg-muted/40 px-4 py-3">
                        <ProviderBatchDetail row={row} onShowItems={onShowItems} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        {fmtInt(batches.length)} provider{" "}
        {batches.length === 1 ? "submission" : "submissions"} on record.
      </footer>
    </section>
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
        <Field label="Billed">{fmtUsd(actual)}</Field>
        <Field label="Estimated batch / live">
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
