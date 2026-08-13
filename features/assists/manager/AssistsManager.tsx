"use client";

/**
 * AssistsManager — the triage surface for EVERY assist, in every state.
 *
 * Why it exists: the dock and the page strips only ever show live pending
 * work, which is correct for a chip and useless for triage — a dismissed
 * assist, a snoozed one, or the receipt of one you accepted last week had no
 * door anywhere in the app. kg-suggestions solved exactly this with
 * `/suggestions`; this is that capability, generalised onto the one ledger.
 *
 * ONE decision UX: every row's title is the canonical `AssistChip`, so reading
 * and acting here go through the same card, the same runner, and the same
 * INTENTIONAL-ACTION LAW as everywhere else. Nothing about the decision is
 * re-implemented here — the manager adds reach (history, filters, bulk
 * triage, restore), never a second way to act.
 */

import { useMemo, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { useTableUrlState } from "@/lib/data-table/useTableUrlState";
import { AssistChip } from "../components/AssistChip";
import { SNOOZE_WINDOWS, isLowConfidence } from "../constants";
import { useAssistsQuery } from "./useAssistsQuery";
import type { Assist, AssistStatus } from "../types";

const STATUS_TABS: Array<{
  value: string;
  label: string;
  statuses: AssistStatus[];
}> = [
  { value: "pending", label: "Open", statuses: ["pending"] },
  { value: "accepted", label: "Accepted", statuses: ["accepted"] },
  { value: "dismissed", label: "Dismissed", statuses: ["dismissed"] },
  {
    value: "all",
    label: "Everything",
    statuses: ["pending", "accepted", "dismissed", "expired", "superseded"],
  },
];

const STATUS_TONE: Record<AssistStatus, string> = {
  pending: "bg-primary/10 text-primary border-primary/20",
  accepted:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  dismissed: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
  superseded: "bg-muted text-muted-foreground border-border",
};

const SOURCE_KIND_OPTIONS = [
  { value: "deterministic", label: "Noticed by the system" },
  { value: "agent", label: "Suggested by AI" },
  { value: "sweep", label: "Background review" },
  { value: "stream", label: "Live run" },
];

function shortDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AssistsManager() {
  const [tab, setTab] = useState<string>("pending");
  const [includeSnoozed, setIncludeSnoozed] = useState(false);
  const [confirmDismissAll, setConfirmDismissAll] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const table = useTableUrlState({
    tableId: "assists",
    defaultSort: { id: "created_at", direction: "desc" },
    defaultPageSize: 25,
  });

  const statuses = useMemo<AssistStatus[]>(
    () => STATUS_TABS.find((t) => t.value === tab)?.statuses ?? ["pending"],
    [tab],
  );

  const {
    rows,
    total,
    stats,
    loading,
    error,
    refresh,
    restore,
    dismissAll,
    snoozeAll,
  } = useAssistsQuery(table.queryState, { statuses, includeSnoozed });

  const shownIds = rows.filter((r) => r.status === "pending").map((r) => r.id);

  const columns: MatrxColumnDef<Assist>[] = useMemo(
    () => [
      {
        id: "title",
        header: "Assist",
        accessorFn: (row) => row.title,
        sortable: false,
        filter: false,
        // The canonical chip — hover/click expands the ONE decision card.
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-2 py-0.5">
            <AssistChip assist={row} />
            {isLowConfidence(row.confidence) && (
              <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-500">
                low confidence
              </span>
            )}
          </div>
        ),
      },
      {
        id: "sourceKey",
        header: "Producer",
        accessorFn: (row) => row.sourceKey,
        filter: "text",
        cell: (row) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.sourceKey}
          </span>
        ),
      },
      {
        id: "sourceKind",
        header: "Origin",
        accessorFn: (row) => row.sourceKind,
        filter: "select",
        filterOptions: SOURCE_KIND_OPTIONS,
        cell: (row) =>
          SOURCE_KIND_OPTIONS.find((o) => o.value === row.sourceKind)?.label ??
          row.sourceKind,
      },
      {
        id: "surfaceName",
        header: "Surface",
        accessorFn: (row) => row.surfaceName ?? "",
        filter: "text",
        cell: (row) => row.surfaceName ?? "Global",
      },
      {
        id: "confidence",
        header: "Confidence",
        accessorFn: (row) => row.confidence ?? -1,
        filter: false,
        cell: (row) =>
          typeof row.confidence === "number"
            ? `${Math.round(row.confidence * 100)}%`
            : "—",
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (row) => row.status,
        filter: false,
        cell: (row) => (
          <Badge
            variant="outline"
            className={`text-[10px] ${STATUS_TONE[row.status]}`}
          >
            {row.status}
            {row.status === "pending" &&
            row.suppressedUntil &&
            new Date(row.suppressedUntil) > new Date()
              ? " · snoozed"
              : ""}
          </Badge>
        ),
      },
      {
        id: "created_at",
        header: "Noticed",
        accessorFn: (row) => row.createdAt,
        filter: false,
        cell: (row) => shortDate(row.createdAt),
      },
      {
        id: "decided_at",
        header: "Decided",
        accessorFn: (row) => row.decidedAt ?? "",
        filter: false,
        cell: (row) => shortDate(row.decidedAt),
      },
      {
        id: "actions",
        header: "",
        sortable: false,
        filter: false,
        cell: (row) =>
          row.status === "pending" ? null : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => {
                void restore(row.id)
                  .then(() => toast.success("Back in your assists"))
                  .catch(() => toast.error("Could not restore — try again"));
              }}
            >
              <RotateCcw className="h-3 w-3" />
              Restore
            </Button>
          ),
      },
    ],
    [restore],
  );

  const runBulk = async (fn: () => Promise<number>, verb: string) => {
    setBulkBusy(true);
    try {
      const count = await fn();
      toast.success(`${count} assist${count === 1 ? "" : "s"} ${verb}`);
    } catch {
      toast.error(
        `Could not ${verb === "dismissed" ? "dismiss" : "snooze"} — try again`,
      );
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {STATUS_TABS.map((entry) => {
          const count = entry.statuses.reduce(
            (sum, status) => sum + stats[status],
            0,
          );
          return (
            <Button
              key={entry.value}
              size="sm"
              variant={tab === entry.value ? "secondary" : "ghost"}
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setTab(entry.value)}
            >
              {entry.label}
              <span className="text-[11px] text-muted-foreground">{count}</span>
            </Button>
          );
        })}
        <Button
          size="sm"
          variant={includeSnoozed ? "secondary" : "ghost"}
          className="h-7 px-2.5 text-xs"
          onClick={() => setIncludeSnoozed((v) => !v)}
        >
          {includeSnoozed ? "Including snoozed" : "Show snoozed"}
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          {shownIds.length > 0 && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    disabled={bulkBusy}
                  >
                    Snooze these {shownIds.length}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {SNOOZE_WINDOWS.map((window) => (
                    <DropdownMenuItem
                      key={window.key}
                      className="text-xs"
                      onSelect={() =>
                        void runBulk(
                          () => snoozeAll(shownIds, window.key),
                          "snoozed",
                        )
                      }
                    >
                      {window.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                disabled={bulkBusy}
                onClick={() => setConfirmDismissAll(true)}
              >
                Dismiss these {shownIds.length}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              className={loading ? "h-3 w-3 animate-spin" : "h-3 w-3"}
            />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <p className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 p-2 sm:p-3">
        <MatrxDataTable<Assist>
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={loading}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: total,
            onStateChange: table.onStateChange,
          }}
          toolbar={{
            searchPlaceholder: "Search title, body, or producer…",
          }}
        />
      </div>

      <ConfirmDialog
        open={confirmDismissAll}
        onOpenChange={setConfirmDismissAll}
        title={`Dismiss ${shownIds.length} assist${shownIds.length === 1 ? "" : "s"}?`}
        description="Dismissing is durable — these will not come back on their own. Snooze instead if you only want them out of the way for now."
        confirmLabel="Dismiss them"
        variant="destructive"
        onConfirm={async () => {
          await runBulk(() => dismissAll(shownIds), "dismissed");
        }}
      />
    </div>
  );
}
