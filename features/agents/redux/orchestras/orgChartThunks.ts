// features/agents/redux/orchestras/orgChartThunks.ts
//
// Thunks for MANUAL org chart links. They write only through orgChartService
// (the association chokepoint) and keep `orchestras.manualOrgChart` coherent:
// writes apply optimistically and are rolled back, loudly, on failure.
// Automatic links are Orchestra member edges — see ./thunks.ts.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import { isScopesRpcErr } from "@/features/scopes/types";
import { orgChartService } from "@/features/agents/org-chart/orgChartService";
import { orchestrasActions } from "./slice";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

export interface OrgChartWriteResult {
  ok: boolean;
  error?: string;
}

const inFlight = new Set<string>();

/** Read the manual links under these managers. Already-read managers are skipped unless `force`. */
export function loadManualOrgEdges(
  managerIds: readonly string[],
  opts?: { force?: boolean },
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const queried = new Set(getState().orchestras.manualOrgChart.queried);
    const ids = [...new Set(managerIds)].filter(
      (id) => id && !inFlight.has(id) && (opts?.force || !queried.has(id)),
    );
    if (ids.length === 0) return;
    ids.forEach((id) => inFlight.add(id));
    dispatch(orchestrasActions.manualOrgPending());
    try {
      const res = await orgChartService.listManualEdges(ids);
      if (isScopesRpcErr(res)) dispatch(orchestrasActions.manualOrgRejected(res.error.message));
      else dispatch(orchestrasActions.manualOrgFulfilled({ managerIds: ids, edges: res.data }));
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
    if (isScopesRpcErr(res)) return res.error.message;
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
 * Place `reportId` under `managerId` by hand. An agent has at most ONE manual
 * manager, so any existing manual placement is replaced. Refuses a placement
 * that would put an agent under its own team — a loop has no top to draw.
 */
export function setManualManager(managerId: string, reportId: string): AppThunk<Promise<OrgChartWriteResult>> {
  return async (dispatch) => {
    // One placement per agent at a time: a double click or a second tab must
    // not read "no manager" twice and leave the agent with two.
    if (placing.has(reportId)) return { ok: false, error: "That agent is already being moved. Try again in a moment." };
    placing.add(reportId);
    try {
      const loop = await sitsUnder(managerId, reportId);
      if (typeof loop === "string") return { ok: false, error: loop };
      if (loop) {
        return {
          ok: false,
          error:
            managerId === reportId
              ? "An agent can't sit under itself."
              : "That agent already sits under this one, so this would make a loop. Move it first.",
        };
      }
      const current = await orgChartService.listManagersOf(reportId);
      if (isScopesRpcErr(current)) return { ok: false, error: current.error.message };
      if (current.data.some((e) => e.managerId === managerId)) return { ok: true };

      // Add the new link FIRST, then drop the old ones: a failure part-way
      // never leaves the agent with no manager at all.
      const temp = { edgeId: `pending:${managerId}:${reportId}`, managerId, reportId };
      dispatch(orchestrasActions.manualOrgEdgeAdded(temp));
      const res = await orgChartService.add(managerId, reportId);
      dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId, reportId }));
      if (isScopesRpcErr(res)) return { ok: false, error: res.error.message };
      dispatch(orchestrasActions.manualOrgEdgeAdded({ edgeId: res.data.id, managerId, reportId }));

      for (const e of current.data) {
        dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId: e.managerId, reportId }));
        const rm = await orgChartService.remove(e.managerId, reportId);
        if (isScopesRpcErr(rm)) {
          dispatch(orchestrasActions.manualOrgEdgeAdded(e));
          return {
            ok: false,
            error: `Placed it under the new agent, but could not take it out from under the old one: ${rm.error.message}`,
          };
        }
      }
      return { ok: true };
    } finally {
      placing.delete(reportId);
    }
  };
}

/** Take `reportId` out from under `managerId` (manual links only). */
export function removeManualManager(managerId: string, reportId: string): AppThunk<Promise<OrgChartWriteResult>> {
  return async (dispatch, getState) => {
    const prev = getState().orchestras.manualOrgChart.edges.find(
      (e) => e.managerId === managerId && e.reportId === reportId,
    );
    dispatch(orchestrasActions.manualOrgEdgeRemoved({ managerId, reportId }));
    const res = await orgChartService.remove(managerId, reportId);
    if (isScopesRpcErr(res)) {
      if (prev) dispatch(orchestrasActions.manualOrgEdgeAdded(prev));
      return { ok: false, error: res.error.message };
    }
    return { ok: true };
  };
}
