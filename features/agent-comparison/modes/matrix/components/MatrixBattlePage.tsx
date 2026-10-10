"use client";

/**
 * MatrixBattlePage — the Matrix mode page: set up a base and two axes, run
 * every cell on the server, read the grid and the analysis.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { BattleRouteNotice, useBattleRoute } from "@/features/agent-comparison/shared/useBattleRoute";
import { MAX_REPEATS, POLL_IDLE_LIMIT_MS, shouldPoll } from "../model";
import { setBasePatch, setRepeats } from "../redux/slice";
import {
  selectMatrixBase,
  selectMatrixCellCount,
  selectMatrixCells,
  selectMatrixDirty,
  selectMatrixProgress,
  selectMatrixReadError,
  selectMatrixRepeats,
  selectMatrixRunError,
  selectMatrixRunInFlight,
  selectMatrixSetId,
} from "../redux/selectors";
import { loadMatrixBattleSet, refreshMatrixCells, runMatrixBattle } from "../redux/thunks";
import { setRunError } from "../redux/slice";
import { AxisEditor } from "./AxisEditor";
import { MatrixResults } from "./MatrixResults";
import { MatrixToolbar } from "./MatrixToolbar";
import { PatchEditor } from "./PatchEditor";
import { Button } from "@ai-matrx/design-system/controls";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const POLL_MS = 2000;

type Tab = "setup" | "results";

export function MatrixBattlePage({ setId = null }: { setId?: string | null }) {
  const dispatch = useAppDispatch();
  const activeSetId = useAppSelector(selectMatrixSetId);
  const routeStatus = useBattleRoute({
    mode: "matrix",
    urlSetId: setId,
    activeSetId,
    load: (id) => dispatch(loadMatrixBattleSet({ setId: id })).unwrap(),
  });
  const cells = useAppSelector(selectMatrixCells);
  const runInFlight = useAppSelector(selectMatrixRunInFlight);
  const runError = useAppSelector(selectMatrixRunError);
  const readError = useAppSelector(selectMatrixReadError);
  const [tab, setTab] = useState<Tab>("setup");
  const [tabChosen, setTabChosen] = useState(false);

  // A reopened battle with results opens on them.
  useEffect(() => {
    if (!tabChosen && cells.length > 0) setTab("results");
  }, [cells.length, tabChosen]);

  // Live while a run call is in flight or a cell is queued/running under a
  // fresh lease; stalled cells never keep it alive. A hard idle limit means it
  // can never poll forever.
  const signature = cells.map((c) => `${c.entryId}:${c.status}:${c.attempt}:${c.stalled}`).join("|");
  const lastChange = useRef(0);
  const [idleStopped, setIdleStopped] = useState(false);
  useEffect(() => {
    lastChange.current = Date.now();
    setIdleStopped(false);
  }, [signature, runInFlight]);
  const polling = shouldPoll(cells, runInFlight) && !idleStopped;
  useEffect(() => {
    if (!polling || !activeSetId) return undefined;
    void dispatch(refreshMatrixCells());
    const t = setInterval(() => {
      if (Date.now() - lastChange.current > POLL_IDLE_LIMIT_MS) {
        setIdleStopped(true);
        return;
      }
      void dispatch(refreshMatrixCells());
    }, POLL_MS);
    return () => clearInterval(t);
  }, [polling, activeSetId, dispatch]);

  const rerunCell = async (cell: { row_id: string; column_id: string; repeat: number }) => {
    try {
      await dispatch(runMatrixBattle({ cells: [cell], scope: "all" })).unwrap();
    } catch (err) {
      toast.error(`Re-run failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ paddingTop: "var(--shell-header-h)" }}>
      <MatrixToolbar
        onRunStarted={() => {
          setTab("results");
          setTabChosen(true);
        }}
      />
      <BattleRouteNotice status={routeStatus} mode="matrix" />

      {(runError || readError) && (
        <div
          role="alert"
          className="flex items-start gap-2 px-3 py-2 border-b border-destructive/40 bg-destructive/10 type-body shrink-0"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
          <span className="min-w-0 flex-1 break-words">{runError ?? readError}</span>
          {runError && (
            <Button variant="quiet" onClick={() => dispatch(setRunError(null))} className="shrink-0">
              Dismiss
            </Button>
          )}
        <ErrorAlchemyMenu /></div>
      )}

      <div className="flex items-center gap-1 h-10 px-3 border-b border-border shrink-0">
        <TabButton active={tab === "setup"} onClick={() => { setTab("setup"); setTabChosen(true); }}>
          Setup
        </TabButton>
        <TabButton active={tab === "results"} onClick={() => { setTab("results"); setTabChosen(true); }}>
          Results
        </TabButton>
        <div className="flex-1" />
        <ProgressLine />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {routeStatus.kind === "loading" || routeStatus.kind === "error" ? null : tab === "setup" ? (
          <SetupView />
        ) : (
          <div className="p-3">
            <MatrixResults onRerunCell={(c) => void rerunCell(c)} busy={false} />
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant="quiet" pressed={active} onClick={onClick}>
      {children}
    </Button>
  );
}

function ProgressLine() {
  const p = useAppSelector(selectMatrixProgress);
  const total = useAppSelector(selectMatrixCellCount);
  const dirty = useAppSelector(selectMatrixDirty);
  const setId = useAppSelector(selectMatrixSetId);
  const parts: string[] = [];
  if (p.running) parts.push(`${p.running} running`);
  if (p.queued) parts.push(`${p.queued} queued`);
  if (p.failed) parts.push(`${p.failed} failed`);
  if (p.stalled) parts.push(`${p.stalled} stalled`);
  if (p.cancelled) parts.push(`${p.cancelled} cancelled`);
  return (
    <div className="flex items-center gap-3 type-secondary text-muted-foreground tabular-nums">
      {setId && dirty && <span className="text-warning">Unsaved changes</span>}
      <span>
        {p.completed}/{total} done
      </span>
      {parts.length > 0 && <span>{parts.join(" · ")}</span>}
    </div>
  );
}

function SetupView() {
  const dispatch = useAppDispatch();
  const base = useAppSelector(selectMatrixBase);
  const repeats = useAppSelector(selectMatrixRepeats);
  const total = useAppSelector(selectMatrixCellCount);
  return (
    <div className="p-3 space-y-3 max-w-[1600px] mx-auto">
      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center gap-2 h-10 px-3 border-b border-border">
          <span className="type-meta uppercase tracking-wider font-semibold text-muted-foreground">Base</span>
          <span className="type-secondary text-muted-foreground">every cell</span>
          <div className="flex-1" />
          <span className="type-secondary text-muted-foreground">Runs per cell</span>
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant="quiet" icon={<Minus />} aria-label="Fewer runs per cell" disabled={repeats <= 1} onClick={() => dispatch(setRepeats(repeats - 1))} />
            <span className="w-6 text-center type-secondary tabular-nums">{repeats}</span>
            <Button variant="quiet" icon={<Plus />} aria-label="More runs per cell" disabled={repeats >= MAX_REPEATS} onClick={() => dispatch(setRepeats(repeats + 1))} />
          </div>
          <span className="type-secondary tabular-nums font-medium" title="Rows × columns × runs per cell">
            {total} cells
          </span>
        </header>
        <div className="p-3">
          <PatchEditor isBase patch={base} onChange={(p) => dispatch(setBasePatch(p))} />
        </div>
      </section>
      <div className="grid gap-3 xl:grid-cols-2 items-start">
        <AxisEditor axis="rows" />
        <AxisEditor axis="columns" />
      </div>
    </div>
  );
}
