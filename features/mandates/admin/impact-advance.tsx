"use client";

/**
 * THE ONE WRITE PATH for moving mandate pins from a screen (Agent Change
 * Impact I3/I4/I5/I8). The standing table and the batch panel both go
 * through this hook, so there is exactly one confirmation dialog, one call,
 * one results shape and one revert door — never a second orchestration.
 *
 * Consequence first (destructive-and-expensive-actions law): the dialog
 * names every pin that moves, from which version to which, how many were
 * chosen despite a warning, and the undo window. Then the write, per row
 * (R8): the server answers advanced / refused / excluded with a sentence of
 * its own, which the screen shows verbatim and never rewrites.
 */

import { useEffect, useState } from "react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  describeAdvance,
  describeRevert,
  indexResultsByRung,
  postAdvance,
  postRevert,
  readRevertWindow,
  revertableRows,
  rungIdentityOf,
  summarizeAdvanceReport,
  type AdvanceReport,
  type AdvanceRowResult,
  type ImpactPosture,
  type ImpactVerdict,
  type RevertWindow,
} from "./impact";

export type ImpactWriteBusy = "advance" | "revert" | null;

export interface ImpactAdvanceApi {
  /** Every batch this screen wrote, newest first — the revert door hangs off these. */
  batches: AdvanceReport[];
  /** The latest server sentence per rung identity, across every batch. */
  resultByRung: Map<string, AdvanceRowResult>;
  /**
   * The verdicts a batch was written FROM, frozen at the click — the grades
   * are re-read after every write, so the live map no longer says which
   * versions that batch moved between.
   */
  verdictsOf: (batch: AdvanceReport) => ReadonlyMap<string, ImpactVerdict>;
  busy: ImpactWriteBusy;
  revertWindow: RevertWindow;
  /**
   * Confirm, then move the pins. Resolves to the report, or null when the
   * person kept the current pins or nothing was sent.
   */
  advance: (
    verdicts: readonly ImpactVerdict[],
    batchLabel: string,
  ) => Promise<AdvanceReport | null>;
  /** Confirm, then put a whole batch (rowId null) or one rung of it back. */
  revert: (
    batch: AdvanceReport,
    rowId: string | null,
  ) => Promise<AdvanceReport | null>;
  /** Forget the batches shown (they stay in the server ledger). */
  clear: () => void;
}

export interface UseImpactAdvanceOptions {
  /**
   * The verdicts the writes are made from, by rung identity — the revert
   * dialog names versions from them.
   */
  verdictByRung: ReadonlyMap<string, ImpactVerdict>;
  /** Called after ANY write that changed something, so the caller re-grades. */
  onWritten?: (report: AdvanceReport) => void;
  /**
   * Which write door (I12). `admin` is the super-admin lane; `mine` is the
   * owner lane — the caller's own personal pins and the org rungs they
   * administer, everything else refused by the server with its sentence.
   */
  posture?: ImpactPosture;
}

function MovesList({ moves }: { moves: string[] }) {
  return (
    <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border bg-muted/30 p-2 font-mono text-[11px]">
      {moves.map((move, index) => (
        <li key={`${index}-${move}`}>{move}</li>
      ))}
    </ul>
  );
}

export function useImpactAdvance({
  verdictByRung,
  onWritten,
  posture = "admin",
}: UseImpactAdvanceOptions): ImpactAdvanceApi {
  const dispatch = useAppDispatch();
  const [batches, setBatches] = useState<AdvanceReport[]>([]);
  const [snapshots, setSnapshots] = useState<
    Record<string, ReadonlyMap<string, ImpactVerdict>>
  >({});
  const [busy, setBusy] = useState<ImpactWriteBusy>(null);
  const [revertWindow, setRevertWindow] = useState<RevertWindow>({
    state: "unknown",
    why: "not read yet",
  });

  useEffect(() => {
    let cancelled = false;
    readRevertWindow().then((window) => {
      if (!cancelled) setRevertWindow(window);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const resultByRung = new Map<string, AdvanceRowResult>();
  // Oldest first so the newest batch's sentence wins per rung.
  for (let i = batches.length - 1; i >= 0; i -= 1) {
    for (const [key, result] of indexResultsByRung(batches[i])) {
      resultByRung.set(key, result);
    }
  }

  const advance: ImpactAdvanceApi["advance"] = async (verdicts, batchLabel) => {
    if (verdicts.length === 0 || busy) return null;
    const { title, description, moves } = describeAdvance(verdicts, revertWindow);
    const ok = await confirm({
      title,
      description: (
        <div className="space-y-2 text-xs">
          <p>{description}</p>
          <MovesList moves={moves} />
        </div>
      ),
      confirmLabel: verdicts.some(
        (v) => v.grade === "orange" || v.grade === "red",
      )
        ? `Advance ${verdicts.length} anyway`
        : `Advance ${verdicts.length}`,
      cancelLabel: "Keep the current pins",
      variant: verdicts.some((v) => v.grade === "red")
        ? "destructive"
        : "default",
    });
    if (!ok) return null;
    setBusy("advance");
    // Frozen BEFORE the write: after it the live map is re-read and the
    // moved rows read as current.
    const frozen = new Map<string, ImpactVerdict>();
    for (const verdict of verdicts) frozen.set(rungIdentityOf(verdict.apply_token), verdict);
    try {
      const report = await postAdvance(dispatch, verdicts, batchLabel, posture);
      setSnapshots((prev) => ({ ...prev, [report.batch_id]: frozen }));
      setBatches((prev) => [report, ...prev]);
      const summary = summarizeAdvanceReport(report);
      if ((report.counts?.advanced ?? 0) > 0) {
        toast.success(`Batch written: ${summary}`);
        onWritten?.(report);
      } else {
        toast.error(`Nothing moved: ${summary} Each row says why.`);
      }
      return report;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The advance failed.",
      );
      return null;
    } finally {
      setBusy(null);
    }
  };

  const revert: ImpactAdvanceApi["revert"] = async (batch, rowId) => {
    if (busy) return null;
    // Newest first: every batch listed before this one is later than it, so
    // a row a later revert already put back is not offered again (D5).
    const later = batches.slice(0, Math.max(0, batches.indexOf(batch)));
    const rows = revertableRows(batch, later).filter(
      (row) => rowId === null || row.token.row_id === rowId,
    );
    if (rows.length === 0) {
      toast.error("Nothing in this batch moved, so there is nothing to put back.");
      return null;
    }
    const frozen = snapshots[batch.batch_id] ?? verdictByRung;
    const { title, description, moves } = describeRevert(
      rows,
      rowId === null ? "batch" : "row",
      frozen,
    );
    const ok = await confirm({
      title,
      description: (
        <div className="space-y-2 text-xs">
          <p>{description}</p>
          <MovesList moves={moves} />
        </div>
      ),
      confirmLabel: rows.length === 1 ? "Put it back" : `Put ${rows.length} back`,
      cancelLabel: "Keep the new pins",
      variant: "default",
    });
    if (!ok) return null;
    setBusy("revert");
    try {
      const report = await postRevert(
        dispatch,
        batch.batch_id,
        rowId,
        `Revert of ${batch.batch_label ?? batch.batch_id}`,
        posture,
      );
      setSnapshots((prev) => ({ ...prev, [report.batch_id]: frozen }));
      setBatches((prev) => [report, ...prev]);
      const summary = summarizeAdvanceReport(report);
      if ((report.counts?.reverted ?? 0) > 0) {
        toast.success(`Reverted: ${summary}`);
        onWritten?.(report);
      } else {
        toast.error(`Nothing put back: ${summary} Each row says why.`);
      }
      return report;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The revert failed.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  return {
    batches,
    resultByRung,
    verdictsOf: (batch) => snapshots[batch.batch_id] ?? verdictByRung,
    busy,
    revertWindow,
    advance,
    revert,
    clear: () => {
      setBatches([]);
      setSnapshots({});
    },
  };
}

export { rungIdentityOf };
