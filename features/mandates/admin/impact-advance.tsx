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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  describeAdvance,
  describeRevert,
  indexResultsByRung,
  mergeAdvanceReports,
  postAdvance,
  postRevert,
  readRevertWindow,
  revertableRows,
  rungIdentityOf,
  splitWriteLegs,
  summarizeAdvanceReport,
  type AdvanceReport,
  type AdvanceRowResult,
  type ImpactPosture,
  type ImpactVerdict,
  type RevertWindow,
  type WriteContext,
  ADMIN_WRITE_CONTEXT,
} from "./impact";
import { adminDoorOpen } from "@/lib/api/adminDoor";

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
   * WHO is writing (I12). Defaults to the signed-in person: a super admin's
   * lane for non-own rungs is `admin`, anyone else's is `mine`. The actor's
   * OWN personal pins always go through `/mine` — so a super admin with one
   * own pin and one org rung makes two requests, shown as one batch.
   */
  context?: WriteContext;
}

/** One server batch behind a merged result view. */
interface BatchPart {
  batch_id: string;
  posture: ImpactPosture;
  /** Rung identities this part carried, so a one-row revert finds its door. */
  rungIds: Set<string>;
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
  context,
}: UseImpactAdvanceOptions): ImpactAdvanceApi {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const actorUserId = useAppSelector(selectUserId);
  // THE ADMIN SEAT (Arman, 2026-09-26): inside the admin section nobody acts
  // as themselves — no pin is "mine", so the actor is never the signed-in
  // admin. The page decides (adminDoorOpen), the same way every shared
  // component picks its admin door.
  const writeContext: WriteContext =
    context ??
    (adminDoorOpen()
      ? ADMIN_WRITE_CONTEXT
      : { posture: isSuperAdmin ? "admin" : "mine", actorUserId: actorUserId ?? null });
  const [batches, setBatches] = useState<AdvanceReport[]>([]);
  // Merged display batch id → the server batches behind it.
  const [parts, setParts] = useState<Record<string, BatchPart[]>>({});
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

  const advance: ImpactAdvanceApi["advance"] = async (chosen, batchLabel) => {
    if (busy) return null;
    // Another person's pin is dropped BEFORE the dialog and before any
    // request; the legs are what will actually be sent.
    const legs = splitWriteLegs(chosen, writeContext);
    const verdicts = legs.flatMap((leg) => leg.verdicts);
    if (verdicts.length === 0) {
      if (chosen.length > 0) {
        toast.error("None of the chosen pins can be moved here — a person's own pin is theirs to advance.");
      }
      return null;
    }
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
      // One request per lane (own pins → /mine, the rest → the actor's lane),
      // shown as ONE batch; every server batch id is kept for the revert.
      const reports: AdvanceReport[] = [];
      const batchParts: BatchPart[] = [];
      for (const leg of legs) {
        const legReport = await postAdvance(dispatch, leg.verdicts, batchLabel, leg.posture);
        reports.push(legReport);
        batchParts.push({
          batch_id: legReport.batch_id,
          posture: leg.posture,
          rungIds: new Set(leg.verdicts.map((v) => rungIdentityOf(v.apply_token))),
        });
      }
      const report = mergeAdvanceReports(reports);
      setParts((prev) => ({ ...prev, [report.batch_id]: batchParts }));
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
      // Each server batch behind this view is reverted through its own door;
      // a one-row revert goes only to the part that carried that rung.
      const batchParts: BatchPart[] = parts[batch.batch_id] ?? [
        { batch_id: batch.batch_id, posture: writeContext.posture, rungIds: new Set(rows.map((row) => rungIdentityOf(row.token))) },
      ];
      const label = `Revert of ${batch.batch_label ?? batch.batch_id}`;
      const reports: AdvanceReport[] = [];
      const revertParts: BatchPart[] = [];
      for (const part of batchParts) {
        const partRows = rows.filter((row) => part.rungIds.has(rungIdentityOf(row.token)));
        if (partRows.length === 0) continue;
        const partReport = await postRevert(dispatch, part.batch_id, rowId, label, part.posture);
        reports.push(partReport);
        revertParts.push({
          batch_id: partReport.batch_id,
          posture: part.posture,
          rungIds: new Set(partRows.map((row) => rungIdentityOf(row.token))),
        });
      }
      // The merged view points at the merged advance, so `revertableRows`
      // sees what this revert put back.
      const report: AdvanceReport = {
        ...mergeAdvanceReports(reports),
        reverts_batch_id: batch.batch_id,
      };
      setParts((prev) => ({ ...prev, [report.batch_id]: revertParts }));
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
      setParts({});
    },
  };
}

export { rungIdentityOf };
