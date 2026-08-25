"use client";

/**
 * "Run the rest of the pipeline" — the bulk action on selected plan rows.
 *
 * THE GAP THIS CLOSES. Arman's acceptance test for this whole system is
 * "click one thing and have the whole thing done", and the durable queue has
 * always been able to do it: `cms_fill_start` takes `node_ids` and, with no
 * `steps`, runs the WHOLE per-page pipeline (family → write → review → build).
 * Only the browser could not ask for it — the client dropped `node_ids`, and
 * the plan table had no row selection — so the one path from a plan to built
 * pages was the whole-site Setup rung or one page at a time. 13,220 pages have
 * been planned; 35 have ever become a page.
 *
 * It is the SAME engine and the same job as the Setup rung, with a narrower
 * selection. Never a second pipeline.
 *
 * Two honesties the copy has to carry, because they decide whether the click
 * is safe:
 *  - It RESUMES. Work already done is skipped, so "the rest" is literal and
 *    re-running is not re-paying.
 *  - It does not publish, and it does not touch live content. A published
 *    page is re-authored into its DRAFT only when explicitly included.
 */

import { useState } from "react";
import { Play, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { extractErrorMessage } from "@/utils/errors";
import { bridgeFillStart } from "@/features/marketing/content-plan/setup/bridge";
import type { PlanNodeRow } from "@/features/marketing/content-plan/types";
import type { NodePipelineProgress } from "@/features/marketing/content-plan/lib/pipeline-progress";

export function RunPipelineBulkAction({
  siteId,
  cmsSiteId,
  selected,
  selectedIds,
  pipelineByNodeId,
  onStarted,
}: {
  siteId: string;
  cmsSiteId: string | null | undefined;
  /** The selected rows that are LOADED — selection can outlive a page change. */
  selected: PlanNodeRow[];
  /** Every selected id, including rows not on this page. This is what runs. */
  selectedIds: string[];
  pipelineByNodeId: ReadonlyMap<string, NodePipelineProgress>;
  onStarted?: () => void;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  // What the selection has ALREADY done, so the confirm can say "the rest"
  // truthfully instead of implying a full rebuild. Counted over loaded rows
  // only — the ids are the authority for what runs, this is only for the copy.
  const untouched = selected.filter(
    (row) => (pipelineByNodeId.get(row.id)?.doneCount ?? 0) === 0,
  ).length;
  const partly = selected.length - untouched;

  const handleRun = async () => {
    if (selectedIds.length === 0) return;
    if (!cmsSiteId) {
      toast.error(
        "This plan is not linked to a website yet, so there is nothing to build into. Link one from the plan's setup first.",
      );
      return;
    }

    const ok = await confirm({
      title: `Run the pipeline on ${selectedIds.length} page${selectedIds.length === 1 ? "" : "s"}?`,
      description:
        `Each selected page runs the full pathway — family territory, writing, review, then the HTML build — ` +
        `using the specialist builder for its page type. ` +
        (partly > 0
          ? `${partly} of them already have finished steps: those steps are SKIPPED, so this picks up where each page left off. `
          : "") +
        `Nothing is published and no live page changes. ` +
        `The job is crash-safe and survives restarts — you can leave this page.`,
      confirmLabel: "Run the pipeline",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const started = await bridgeFillStart(dispatch, siteId, {
        cmsSite: cmsSiteId,
        // No `steps` — that IS "the whole pipeline" at the server.
        nodeIds: selectedIds,
      });
      // Every skip is a reason a page the user picked is not running. Silence
      // here is how a selection of 20 quietly becomes a job of 3.
      for (const line of started.skipped) toast.info(line);
      toast.success(
        `Running ${started.estimate.pages} page${started.estimate.pages === 1 ? "" : "s"} — ` +
          `${started.estimate.calls} AI step${started.estimate.calls === 1 ? "" : "s"}` +
          (started.estimate.usd != null
            ? `, about $${started.estimate.usd.toFixed(2)}`
            : "") +
          ". Progress shows on each page's rail.",
      );
      onStarted?.();
    } catch (error) {
      toast.error(
        `Could not start the run: ${extractErrorMessage(error)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" onClick={handleRun} disabled={busy || selectedIds.length === 0}>
      {busy ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Play className="mr-1.5 h-3.5 w-3.5" />
      )}
      Run the rest of the pipeline
    </Button>
  );
}
