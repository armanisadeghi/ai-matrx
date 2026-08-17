"use client";

/**
 * RegressionCasesFromFinding — the door out of "this went wrong once" into
 * "this can never go wrong again unnoticed" (C-17), taken FROM A FINDING.
 *
 * A finding cites the exact recorded calls it was reasoning about. Each of
 * those is a `chat.request_snapshot` the server already pinned as evidence, so
 * it is replayable — which makes it eligible to become a permanent test that a
 * model upgrade has to pass. Without this the human had to copy a snapshot id
 * out of the evidence and go find the cx-explorer snapshot viewer, which lives
 * in a different app.
 *
 * Two rules this component does not bend:
 *   * the snapshot ids come from `finding.snapshot_ids`, which the SERVER
 *     collects by the one C-13 rule that also decides which snapshots the
 *     retention pin protects. Re-deriving them here by scraping evidence text
 *     could offer a case built on a snapshot nothing pins — a "permanent" test
 *     that stops being reproducible at the next prune;
 *   * every existing case is rendered with its last verdict, so the button is
 *     never offered twice for the same snapshot and the panel answers "did the
 *     check pass?" rather than "a case exists".
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { createRegressionCaseFromFinding, listRegressionCases } from "../api";
import type { Finding, RegressionCase } from "../types";
import { fmtCost, fmtDate } from "./tokens";

/**
 * `error` is NOT `fail` — "the check could not run" and "the unit regressed"
 * demand different actions, and the server keeps them apart end to end.
 */
const RESULT_COLOR: Record<string, string> = {
  pass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  fail: "bg-red-500/15 text-red-600 dark:text-red-400",
  error: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function CaseRow({ item }: { item: RegressionCase }) {
  return (
    <li className="flex flex-wrap items-center gap-1.5 text-xs">
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="font-mono text-muted-foreground">
        {item.snapshot_id.slice(0, 8)}
      </span>
      {item.status === "retired" ? (
        <Badge variant="outline" className="text-muted-foreground">
          retired
        </Badge>
      ) : (
        <Badge variant="outline">active</Badge>
      )}
      <Badge
        className={cn(
          "border-0",
          RESULT_COLOR[item.last_result ?? ""] ??
            "bg-slate-500/15 text-slate-600 dark:text-slate-400",
        )}
      >
        {item.last_result
          ? `${item.last_result}${item.last_verdict ? ` · ${item.last_verdict}` : ""}`
          : "never checked"}
      </Badge>
      {(item.consecutive_failures ?? 0) > 0 && (
        <span className="text-red-600 dark:text-red-400">
          {item.consecutive_failures}× failing in a row
        </span>
      )}
      <span className="text-muted-foreground">
        {item.last_checked_at
          ? `checked ${fmtDate(item.last_checked_at)} · ${fmtCost(item.last_cost_usd)}`
          : "no check has run yet"}
      </span>
      {item.last_reason && (
        <span className="w-full text-muted-foreground">{item.last_reason}</span>
      )}
    </li>
  );
}

export function RegressionCasesFromFinding({ finding }: { finding: Finding }) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const queryClient = useQueryClient();
  const snapshotIds = finding.snapshot_ids ?? [];

  const cases = useQuery({
    queryKey: ["hindsight", "regression-cases", finding.id],
    queryFn: () => listRegressionCases({ originFindingId: finding.id }),
    // Creating a case is admin-only, and so is reading the suite.
    enabled: isAdmin && snapshotIds.length > 0,
  });

  const create = useMutation({
    mutationFn: (snapshotId: string) =>
      createRegressionCaseFromFinding(snapshotId, {
        id: finding.id,
        title: finding.title,
      }),
    onSuccess: () => {
      toast.success(
        "Saved as a regression case — this recorded call now has to keep passing",
      );
      queryClient.invalidateQueries({
        queryKey: ["hindsight", "regression-cases", finding.id],
      });
    },
    onError: (err: Error) => toast.error(`Could not save the case: ${err.message}`),
  });

  // No cited snapshot means no replayable call — offering the button would be
  // a dead end. A non-admin sees nothing, because the endpoint refuses them.
  if (!isAdmin || snapshotIds.length === 0) return null;

  const covered = new Set((cases.data ?? []).map((c) => c.snapshot_id));
  const uncovered = snapshotIds.filter((id) => !covered.has(id));

  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">
        Regression cases
      </div>
      {cases.isLoading && <Skeleton className="mt-1 h-5 w-48" />}
      {cases.isError && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          Could not load this finding&apos;s cases:{" "}
          {(cases.error as Error).message}
        </p>
      )}
      {(cases.data ?? []).length > 0 && (
        <ul className="mt-1 space-y-1">
          {(cases.data ?? []).map((item) => (
            <CaseRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      {uncovered.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {uncovered.length === snapshotIds.length
              ? "This finding cites recorded calls that can be re-run. Make one a permanent test and every future model or instruction change has to keep passing it."
              : "The remaining recorded calls cited here are not covered yet."}
          </p>
          {uncovered.map((snapshotId) => (
            <div key={snapshotId} className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={create.isPending}
                onClick={() => create.mutate(snapshotId)}
                data-testid="hindsight-make-regression-case"
              >
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                {create.isPending && create.variables === snapshotId
                  ? "Saving…"
                  : "Make this a regression case"}
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {snapshotId.slice(0, 8)}
              </span>
              <CopyButton content={snapshotId} size="xs" tooltip="Copy snapshot id" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
