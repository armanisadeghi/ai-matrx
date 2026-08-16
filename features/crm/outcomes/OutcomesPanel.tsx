"use client";

// features/crm/outcomes/OutcomesPanel.tsx
//
// The campaign's attribution feed — every win the crawl credited to a pitch
// (platform.outcome_event, IC-5), with the evidence drawer that makes the low
// bar defensible: every matching signal that fired AND the ones that did not,
// plus one-click confirm / "not ours".
//
// Deep link: /crm/outreach-lists/[listId]?view=outcomes&outcome=<id> — the
// assist chips the attribution pass raises land here with the row preselected.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award,
  Check,
  CircleHelp,
  ExternalLink,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { formatRelativeTime } from "@/utils/datetime";
import { cn } from "@/lib/utils";
import {
  OUTCOME_STATUS_LABELS,
  confidenceLabel,
  outcomeDomain,
  outcomeVerdict,
  parseOutcomeDetail,
  signalLabel,
  type OutcomeEventRow,
  type OutcomeStatus,
} from "./lib";
import {
  countOutcomeEvents,
  decideOutcomeEvent,
  listOutcomeEvents,
  type OutcomeCounts,
} from "./service";

const PAGE_SIZE = 25;

const TONE_CLASSES: Record<string, string> = {
  win: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  rejected: "bg-muted text-muted-foreground border-border",
};

function StatusBadge({ row }: { row: OutcomeEventRow }) {
  const { tone } = outcomeVerdict(row);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        TONE_CLASSES[tone],
      )}
    >
      {tone === "win" ? (
        <Award className="h-3 w-3" />
      ) : tone === "pending" ? (
        <CircleHelp className="h-3 w-3" />
      ) : (
        <X className="h-3 w-3" />
      )}
      {OUTCOME_STATUS_LABELS[(row.status as OutcomeStatus) ?? "proposed"] ?? row.status}
    </span>
  );
}

function OutcomeDetail({
  row,
  onDecide,
  deciding,
}: {
  row: OutcomeEventRow;
  onDecide: (status: "confirmed" | "rejected") => void;
  deciding: boolean;
}) {
  const parsed = parseOutcomeDetail(row.match_detail);
  const verdict = outcomeVerdict(row);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">{verdict.detail}</p>

      <div className="flex flex-wrap items-center gap-2">
        {row.evidence_url && (
          <a
            href={row.evidence_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            See the page carrying the link
          </a>
        )}
        <span className="text-xs text-muted-foreground">
          Confidence: {confidenceLabel(row.confidence)} ({row.confidence}/100)
        </span>
        {parsed.additionalAppearances > 0 && (
          <span className="text-xs text-muted-foreground">
            +{parsed.additionalAppearances} more link
            {parsed.additionalAppearances === 1 ? "" : "s"} from this domain in the
            same window (counted, not double-credited)
          </span>
        )}
      </div>

      {/* THE EVIDENCE DRAWER — every signal, fired or not. */}
      <div className="rounded-md border border-border">
        <div className="border-b border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-foreground">
          What we checked
        </div>
        <ul className="divide-y divide-border">
          {parsed.signals.map((signal) => (
            <li key={signal.name} className="flex items-start gap-2 px-2.5 py-1.5">
              {signal.fired ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <div className="min-w-0">
                <span
                  className={cn(
                    "text-xs font-medium",
                    signal.fired ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {signalLabel(signal.name)}
                </span>
                <p className="text-xs text-muted-foreground">{signal.detail}</p>
              </div>
            </li>
          ))}
          {parsed.signals.length === 0 && (
            <li className="px-2.5 py-1.5 text-xs text-muted-foreground">
              This outcome was recorded manually — no automated signals.
            </li>
          )}
        </ul>
      </div>

      {parsed.competingInteractionIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {parsed.competingInteractionIds.length} other pitch
          {parsed.competingInteractionIds.length === 1 ? "" : "es"} went to this
          domain inside the window; the most recent one before the link appeared
          holds the credit.
        </p>
      )}

      {row.decided_by ? (
        <p className="text-xs text-muted-foreground">
          Decided by a human {row.decided_at ? formatRelativeTime(row.decided_at) : ""}
          {parsed.humanNote ? ` — “${parsed.humanNote}”` : ""}
        </p>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          {row.status !== "confirmed" && (
            <Button
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={deciding}
              onClick={() => onDecide("confirmed")}
            >
              <Check className="h-3.5 w-3.5" />
              Confirm the win
            </Button>
          )}
          {row.status !== "rejected" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              disabled={deciding}
              onClick={() => onDecide("rejected")}
            >
              <X className="h-3.5 w-3.5" />
              Not ours
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function OutcomesPanel({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("outcome");

  const [rows, setRows] = useState<OutcomeEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<OutcomeCounts | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OutcomeStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [pageData, countData] = await Promise.all([
        listOutcomeEvents({ campaignId, status: statusFilter, page, pageSize: PAGE_SIZE }),
        countOutcomeEvents(campaignId),
      ]);
      setRows(pageData.rows);
      setTotal(pageData.total);
      setCounts(countData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, statusFilter, page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decide = useCallback(
    async (row: OutcomeEventRow, status: "confirmed" | "rejected") => {
      setDeciding(true);
      try {
        await decideOutcomeEvent({ outcomeId: row.id, status });
        toast.success(
          status === "confirmed" ? "Win confirmed" : "Marked as not ours",
        );
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The decision failed.");
      } finally {
        setDeciding(false);
      }
    },
    [refresh],
  );

  const columns = useMemo<MatrxColumnDef<OutcomeEventRow>[]>(
    () => [
      {
        id: "what",
        accessorFn: (row) => outcomeDomain(row),
        header: "What happened",
        sortable: false,
        filter: false,
        cell: (row) => (
          <span className="truncate text-xs font-medium text-foreground">
            {outcomeVerdict(row).headline}
          </span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        sortable: false,
        filter: false,
        width: 130,
        cell: (row) => <StatusBadge row={row} />,
      },
      {
        id: "confidence",
        accessorKey: "confidence",
        header: "Confidence",
        sortable: false,
        filter: false,
        width: 110,
        cell: (row) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {confidenceLabel(row.confidence)} · {row.confidence}
          </span>
        ),
      },
      {
        id: "occurred",
        accessorKey: "occurred_at",
        header: "Link went live",
        sortable: false,
        filter: false,
        width: 120,
        cell: (row) => (
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {formatRelativeTime(row.occurred_at)}
          </span>
        ),
      },
    ],
    [],
  );

  const filterChip = (status: OutcomeStatus | "all", label: string, count?: number) => (
    <button
      key={status}
      type="button"
      onClick={() => {
        setStatusFilter(status);
        setPage(1);
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]",
        statusFilter === status
          ? "border-primary bg-primary/10 font-medium text-foreground"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      {typeof count === "number" && (
        <span className="tabular-nums">{count.toLocaleString()}</span>
      )}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Award className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Outcomes</span>
        <span className="text-[11px] text-muted-foreground">
          Links our own crawl saw appear after your pitches — with the evidence.
        </span>
        <div className="ml-auto flex items-center gap-1">
          {filterChip("all", "All", counts ? counts.confirmed + counts.proposed + counts.rejected : undefined)}
          {filterChip("confirmed", "Wins", counts?.confirmed)}
          {filterChip("proposed", "Needs your call", counts?.proposed)}
          {filterChip("rejected", "Not ours", counts?.rejected)}
        </div>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}
      <MatrxDataTable<OutcomeEventRow>
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={isLoading}
        zebra
        selectedId={highlightId ?? undefined}
        detail={{
          title: (row) => outcomeVerdict(row).headline,
          description: (row) => outcomeVerdict(row).detail,
          render: (row) => (
            <OutcomeDetail
              row={row}
              deciding={deciding}
              onDecide={(status) => void decide(row, status)}
            />
          ),
        }}
        window={{
          title: (row) => outcomeVerdict(row).headline,
          renderView: (row) => (
            <OutcomeDetail
              row={row}
              deciding={deciding}
              onDecide={(status) => void decide(row, status)}
            />
          ),
          renderEdit: false,
          defaultTab: "view",
        }}
        query={{
          mode: "controlled",
          totalItems: total,
          state: {
            page,
            pageSize: PAGE_SIZE,
            search: "",
            anyOf: "",
            columnFilters: {},
            sort: { id: "occurred", direction: "desc" },
          },
          onStateChange: (state: MatrxDataTableQueryState) => setPage(state.page),
        }}
        toolbar={{ search: false }}
        copy={{
          label: "Attribution outcome",
          listLabel: "Attribution outcomes",
          location: `/crm/outreach-lists/${campaignId}?view=outcomes`,
          rowKind: "platform-outcome-event",
          listKind: "platform-outcome-event-list",
          humanRow: (row) =>
            `${outcomeVerdict(row).headline} — ${row.status}, confidence ${row.confidence}`,
          showRow: false,
          showToolbar: false,
        }}
        emptyState={{
          icon: <Award className="h-5 w-5" />,
          title: statusFilter === "all" ? "No outcomes yet" : "Nothing here yet",
          description:
            "When a domain you pitched publishes a link, the nightly crawl credits it here automatically — with every signal it checked.",
        }}
      />
    </div>
  );
}
