// features/agents/org-chart/useAgentOrgChart.ts
//
// Loads and assembles the org chart from Redux: Orchestras (directs links,
// `orchestras.byId`), recorded links between any boxes and the positions
// (`orchestras.manualOrgChart`).
//
// With `rootIds` (BOX ids) it builds only what hangs under those boxes — the
// Orchestra builder passes its Conductor and gets every nested Orchestra and
// recorded report beneath it, loaded level by level as they are discovered.
// Without `rootIds` it builds the whole chart the viewer can see, every
// position included (an open seat is still part of the chart).

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllAgents } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { fetchOrchestras, loadOrchestra } from "@/features/agents/redux/orchestras/thunks";
import { loadManualOrgEdges, loadOrgPositions, loadSeatJobs } from "@/features/agents/redux/orchestras/orgChartThunks";
import {
  selectManualOrgEdges,
  selectManualOrgError,
  selectOrchestraEntries,
  selectOrchestrasList,
  selectOrchestrasListError,
  selectOrchestrasListStatus,
  selectOrgPositions,
  selectOrgPositionsStatus,
} from "@/features/agents/redux/orchestras/selectors";
import { onMandateCacheInvalidated } from "@ai-matrx/chat/mandates/service";
import { useEnsureAgentsLoaded } from "@/features/agents/orchestras/hooks/useEnsureAgentsLoaded";
import { buildAgentOrgForest, type OrchestraShape } from "./buildAgentOrgForest";
import { boxId, parseBoxId } from "./constants";

export function useAgentOrgChart(opts: { rootIds?: string[] } = {}) {
  const dispatch = useAppDispatch();
  useEnsureAgentsLoaded();
  const list = useAppSelector(selectOrchestrasList);
  const listStatus = useAppSelector(selectOrchestrasListStatus);
  const listError = useAppSelector(selectOrchestrasListError);
  const entries = useAppSelector(selectOrchestraEntries);
  const storedEdges = useAppSelector(selectManualOrgEdges);
  const positionsStatus = useAppSelector(selectOrgPositionsStatus);
  const manualError = useAppSelector(selectManualOrgError);
  const positions = useAppSelector(selectOrgPositions);
  const agents = useAppSelector(selectAllAgents);

  // A position in Trash keeps its links (so a restore puts it back in place);
  // once positions are known, those links are not drawn.
  const livePositions = new Set(positions.map((p) => p.id));
  const manualEdges =
    positionsStatus === "ready"
      ? storedEdges.filter((e) =>
          [e.managerId, e.reportId].every((b) => {
            const { type, id } = parseBoxId(b);
            return type !== "position" || livePositions.has(id);
          }),
        )
      : storedEdges;

  useEffect(() => {
    dispatch(fetchOrchestras());
    dispatch(loadOrgPositions());
  }, [dispatch]);

  // Plain agent ids (the Orchestra store's keys).
  const conductorIds = new Set(list.map((o) => o.conductorId));
  for (const [id, e] of Object.entries(entries)) if (e.exists) conductorIds.add(id);

  const failedIds = new Set(
    Object.entries(entries)
      .filter(([, e]) => e.status === "error")
      .map(([id]) => id),
  );

  const orchestras = new Map<string, OrchestraShape>();
  for (const [id, e] of Object.entries(entries)) {
    if (e.status === "ready" && e.exists) {
      orchestras.set(id, { members: e.members, accent: e.config.accent, mode: e.config.mode });
    }
  }

  // Everything reachable from the roots (every kind of link), or everyone. Box ids.
  const reachable = new Set<string>();
  if (!opts.rootIds) {
    for (const id of [...conductorIds, ...Object.keys(agents)]) reachable.add(boxId("agent", id));
    for (const o of orchestras.values()) o.members.forEach((m) => reachable.add(boxId("agent", m.agentId)));
    for (const p of positions) reachable.add(boxId("position", p.id));
    for (const e of manualEdges) {
      reachable.add(e.managerId);
      reachable.add(e.reportId);
    }
  } else {
    const manualKids = new Map<string, string[]>();
    for (const e of manualEdges) manualKids.set(e.managerId, [...(manualKids.get(e.managerId) ?? []), e.reportId]);
    const stack = [...opts.rootIds];
    while (stack.length) {
      const id = stack.pop() as string;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const { type, id: entity } = parseBoxId(id);
      if (type === "agent") orchestras.get(entity)?.members.forEach((m) => stack.push(boxId("agent", m.agentId)));
      stack.push(...(manualKids.get(id) ?? []));
    }
  }

  // Load every reachable Orchestra not yet loaded, and every reachable box's
  // recorded links (both directions, so a person above an agent is found).
  // Each pass can reveal a deeper level; this re-runs until nothing new appears.
  const toLoad = [...reachable]
    .map((b) => parseBoxId(b))
    .filter((b) => b.type === "agent" && conductorIds.has(b.id) && !entries[b.id])
    .map((b) => b.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!toLoad) return;
    for (const id of toLoad.split(",")) dispatch(loadOrchestra(id));
  }, [dispatch, toLoad]);

  const boxKey = [...reachable].sort().join(",");
  useEffect(() => {
    if (!boxKey) return;
    dispatch(loadManualOrgEdges(boxKey.split(","), { direction: "both" }));
  }, [dispatch, boxKey]);

  // The job behind every defined seat (where it stands on the ladder).
  const seatMandates = [...new Set(positions.map((p) => p.mandateId).filter((m): m is string => Boolean(m)))].sort().join(",");
  useEffect(() => {
    if (!seatMandates) return;
    const ids = seatMandates.split(",");
    dispatch(loadSeatJobs(ids));
    // A job changes in its own window (an agent built, a Holder set): re-read then.
    return onMandateCacheInvalidated(() => void dispatch(loadSeatJobs(ids)));
  }, [dispatch, seatMandates]);

  const positionById = new Map(positions.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const { type, id: entity } = parseBoxId(id);
    if (type === "agent") return agents[entity]?.name ?? "";
    if (type === "position") return positionById.get(entity)?.name ?? "";
    return "";
  };

  const forest = buildAgentOrgForest({
    orchestras,
    conductorIds,
    failedIds,
    manualEdges,
    rootIds: opts.rootIds,
    nameOf,
    standalone: opts.rootIds ? undefined : positions.map((p) => boxId("position", p.id)),
  });

  const loading =
    listStatus === "loading" ||
    listStatus === "idle" ||
    [...reachable].some((b) => {
      const { type, id } = parseBoxId(b);
      return type === "agent" && conductorIds.has(id) && entries[id]?.status !== "ready" && entries[id]?.status !== "error";
    });

  return {
    forest,
    orchestras,
    conductorIds,
    manualEdges,
    positions,
    loading,
    error:
      listError ??
      manualError ??
      (failedIds.size
        ? `${failedIds.size} Orchestra${failedIds.size === 1 ? "" : "s"} could not be loaded; ${failedIds.size === 1 ? "its" : "their"} team${failedIds.size === 1 ? " is" : "s are"} not shown.`
        : null),
  };
}
