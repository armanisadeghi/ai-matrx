// features/agents/redux/orchestras/orgChartThunks.ts
//
// Thunks for MANUAL org chart links. They write only through orgChartService
// (the association chokepoint) and keep `orchestras.manualOrgChart` coherent:
// writes apply optimistically and are rolled back, loudly, on failure.
// Automatic links are Orchestra member edges — see ./thunks.ts.

import { isAssociationsRpcErr } from "@ai-matrx/associations";
import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { orgChartService } from "@/features/agents/org-chart/orgChartService";
import { orchestrasActions } from "./slice";
import type { ManualOrgEdge } from "@/features/agents/org-chart/buildAgentOrgForest";
import { positionsService, readSeatJobs, type OrgPosition } from "@/features/agents/org-chart/positionsService";
import type { RecordedLinkKind } from "@/features/agents/org-chart/constants";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export interface OrgChartWriteResult {
  ok: boolean;
  error?: string;
  /** The refusal was a loop (the chosen manager already sits under the box). */
  loop?: boolean;
  /** Nothing to do: the box already sat there. */
  unchanged?: boolean;
  /** A hand-off or dotted line this pair held before, which the placement replaced. */
  replaced?: ManualOrgEdge;
}

const inFlight = new Set<string>();

/** Read the manual links under these managers. Already-read managers are skipped unless `force`. */
export function loadManualOrgEdges(
  managerIds: readonly string[],
  opts?: { force?: boolean; direction?: "out" | "both" },
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const queried = new Set(getState().orchestras.manualOrgChart.queried);
    const ids = [...new Set(managerIds)].filter(
      (id) => id && !inFlight.has(id) && (opts?.force || !queried.has(id)),
    );
    if (ids.length === 0) return;
    ids.forEach((id) => inFlight.add(id));
    const startedAtSeq = getState().orchestras.manualOrgChart.writeSeq;
    dispatch(orchestrasActions.manualOrgPending());
    try {
      const res = await orgChartService.listManualEdges(ids, opts?.direction ?? "out");
      if (isAssociationsRpcErr(res)) dispatch(orchestrasActions.manualOrgRejected(res.error.message));
      else dispatch(orchestrasActions.manualOrgFulfilled({ managerIds: ids, edges: res.data, startedAtSeq }));
    } finally {
      ids.forEach((id) => inFlight.delete(id));
    }
  };
}

/**
 * Does `managerId` already sit somewhere under `reportId`? Read FRESH from the
 * server, level by level, so the answer never depends on how much of the chart
 * this screen happened to load.
 */
async function sitsUnder(managerId: string, reportId: string): Promise<boolean | string> {
  if (managerId === reportId) return true;
  const seen = new Set<string>([reportId]);
  let frontier = [reportId];
  while (frontier.length) {
    const res = await orgChartService.listChildren(frontier);
    if (isAssociationsRpcErr(res)) return res.error.message;
    const next: string[] = [];
    for (const { childId } of res.data) {
      if (childId === managerId) return true;
      if (!seen.has(childId)) {
        seen.add(childId);
        next.push(childId);
      }
    }
    frontier = next;
  }
  return false;
}

const placing = new Set<string>();

/**
 * Place `reportId` under `managerId` by hand. A box has at most ONE manual
 * manager, so any existing manual placement is replaced. Refuses a placement
 * that would put a box under its own team — a loop has no top to draw.
 */
export function setManualManager(managerId: string, reportId: string): AppThunk<Promise<OrgChartWriteResult>> {
  return async (dispatch, getState) => {
    // One placement per box at a time: a double click or a second tab must
    // not read "no manager" twice and leave the box with two.
    if (placing.has(reportId)) return { ok: false, error: "That box is already being moved. Try again in a moment." };
    placing.add(reportId);
    try {
      const loop = await sitsUnder(managerId, reportId);
      if (typeof loop === "string") return { ok: false, error: loop };
      if (loop) {
        return {
          ok: false,
          loop: true,
          error:
            managerId === reportId
              ? "A box can't sit under itself."
              : "That box already sits under this one, so this would make a loop. Move it first.",
        };
      }
      const current = await orgChartService.listManagersOf(reportId);
      if (isAssociationsRpcErr(current)) return { ok: false, error: current.error.message };
      if (current.data.some((e) => e.managerId === managerId)) return { ok: true, unchanged: true };

      // The pair may already hold a hand-off or dotted line: the placement
      // re-types that one record, so a failure must put it back.
      const pairEdge = getState().orchestras.manualOrgChart.edges.find(
        (e) => e.managerId === managerId && e.reportId === reportId && !e.edgeId.startsWith("pending:"),
      );

      // Add the new link FIRST, then drop the old ones: a failure part-way
      // never leaves the box with no manager at all.
      dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId, reportId }));
      const temp = { edgeId: `pending:${managerId}:${reportId}`, managerId, reportId, kind: "reports_to" as const };
      dispatch(orchestrasActions.manualOrgEdgeAdded(temp));
      const res = await orgChartService.add(managerId, reportId, "reports_to");
      dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId, reportId }));
      if (isAssociationsRpcErr(res)) {
        if (pairEdge) dispatch(orchestrasActions.manualOrgEdgeAdded(pairEdge));
        return { ok: false, error: res.error.message };
      }
      dispatch(
        orchestrasActions.manualOrgEdgeAdded({ edgeId: res.data.id, managerId, reportId, kind: "reports_to" }),
      );

      for (const e of current.data) {
        dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId: e.managerId, reportId }));
        const rm = await orgChartService.remove(e.managerId, reportId);
        if (isAssociationsRpcErr(rm)) {
          dispatch(orchestrasActions.manualOrgEdgeAdded(e));
          return {
            ok: false,
            error: `Placed it under the new box, but could not take it out from under the old one: ${rm.error.message}`,
          };
        }
      }
      return pairEdge ? { ok: true, replaced: pairEdge } : { ok: true };
    } finally {
      placing.delete(reportId);
    }
  };
}

/**
 * Record a hand-off or dotted line from → to. Cross links don't place a box,
 * so there is no one-manager rule and no loop check (work may come back around).
 * A pair holds one recorded link, so this re-types an existing one.
 */
export function addCrossLink(
  fromId: string,
  toId: string,
  kind: Exclude<RecordedLinkKind, "reports_to">,
): AppThunk<Promise<OrgChartWriteResult>> {
  return async (dispatch, getState) => {
    if (fromId === toId) return { ok: false, error: "A box can't link to itself." };
    const prev = getState().orchestras.manualOrgChart.edges.find(
      (e) => e.managerId === fromId && e.reportId === toId,
    );
    dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId: fromId, reportId: toId }));
    dispatch(
      orchestrasActions.manualOrgEdgeAdded({ edgeId: `pending:${fromId}:${toId}`, managerId: fromId, reportId: toId, kind }),
    );
    const res = await orgChartService.add(fromId, toId, kind);
    dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId: fromId, reportId: toId }));
    if (isAssociationsRpcErr(res)) {
      if (prev) dispatch(orchestrasActions.manualOrgEdgeAdded(prev));
      return { ok: false, error: res.error.message };
    }
    dispatch(orchestrasActions.manualOrgEdgeAdded({ edgeId: res.data.id, managerId: fromId, reportId: toId, kind }));
    return { ok: true };
  };
}

/** Remove the recorded link between this pair (any type). Orchestra links are changed in the Orchestra. */
export function removeManualManager(managerId: string, reportId: string): AppThunk<Promise<OrgChartWriteResult>> {
  return async (dispatch, getState) => {
    const prev = getState().orchestras.manualOrgChart.edges.find(
      (e) => e.managerId === managerId && e.reportId === reportId,
    );
    dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId, reportId }));
    const res = await orgChartService.remove(managerId, reportId);
    if (isAssociationsRpcErr(res)) {
      if (prev) dispatch(orchestrasActions.manualOrgEdgeAdded(prev));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}

// ── positions ──────────────────────────────────────────────────────────────

let positionsInFlight: Promise<void> | null = null;

/** Load every position the viewer can see. Deduped; `ready` short-circuits unless forced. */
export function loadOrgPositions(opts?: { force?: boolean }): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const status = getState().orchestras.manualOrgChart.positionsStatus;
    if (!opts?.force && status === "ready") return;
    if (positionsInFlight) return positionsInFlight;
    dispatch(orchestrasActions.positionsPending());
    positionsInFlight = positionsService
      .list()
      .then((rows) => {
        dispatch(orchestrasActions.positionsFulfilled(rows));
      })
      .catch((e: unknown) => {
        dispatch(orchestrasActions.positionsRejected(e instanceof Error ? e.message : "Positions could not be loaded."));
      })
      .finally(() => {
        positionsInFlight = null;
      });
    return positionsInFlight;
  };
}

export function createOrgPosition(input: {
  organizationId: string;
  name: string;
  description?: string | null;
  filledByUserId?: string | null;
}): AppThunk<Promise<OrgPosition | { error: string }>> {
  return async (dispatch) => {
    try {
      const created = await positionsService.create(input);
      dispatch(orchestrasActions.positionUpserted(created));
      return created;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "The position could not be created." };
    }
  };
}

export function updateOrgPosition(
  id: string,
  patch: { name?: string; description?: string | null; filledByUserId?: string | null; mandateId?: string | null },
): AppThunk<Promise<OrgChartWriteResult>> {
  return async (dispatch) => {
    try {
      dispatch(orchestrasActions.positionUpserted(await positionsService.update(id, patch)));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "The position could not be saved." };
    }
  };
}

/** Move a position to Trash. Its links stay, so a restore brings it back in place. */
export function removeOrgPosition(position: OrgPosition): AppThunk<Promise<OrgChartWriteResult>> {
  return async (dispatch) => {
    dispatch(orchestrasActions.positionRemoved(position.id));
    try {
      await positionsService.remove(position.id);
      return { ok: true };
    } catch (e) {
      dispatch(orchestrasActions.positionUpserted(position));
      return { ok: false, error: e instanceof Error ? e.message : "The position could not be removed." };
    }
  };
}

export function restoreOrgPosition(position: OrgPosition): AppThunk<Promise<OrgChartWriteResult>> {
  return async (dispatch) => {
    try {
      await positionsService.restore(position.id);
      dispatch(orchestrasActions.positionUpserted(position));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "The position could not be restored." };
    }
  };
}

/** Read the jobs behind these seats (where each stands on the ladder). Always fresh: a job changes in its own window. */
export function loadSeatJobs(mandateIds: readonly string[]): AppThunk<Promise<void>> {
  return async (dispatch) => {
    if (mandateIds.length === 0) return;
    try {
      const jobs = await readSeatJobs(mandateIds);
      dispatch(orchestrasActions.seatJobsFulfilled([...jobs.values()]));
    } catch (e) {
      dispatch(orchestrasActions.seatJobsRejected(e instanceof Error ? e.message : "The jobs behind positions could not load."));
    }
  };
}
