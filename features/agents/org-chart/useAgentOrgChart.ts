// features/agents/org-chart/useAgentOrgChart.ts
//
// Loads and assembles an agent org chart from Redux: Orchestras (automatic
// links, `orchestras.byId`) + manual links (`orchestras.manualOrgChart`).
//
// With `rootIds` it builds only what hangs under those agents — the Orchestra
// builder passes its Conductor and gets every nested Orchestra and manual
// report beneath it, loaded level by level as they are discovered. Without
// `rootIds` it builds the whole chart the viewer can see.

"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchOrchestras, loadOrchestra } from "@/features/agents/redux/orchestras/thunks";
import { loadManualOrgEdges } from "@/features/agents/redux/orchestras/orgChartThunks";
import {
  selectManualOrgEdges,
  selectManualOrgError,
  selectOrchestraEntries,
  selectOrchestrasList,
  selectOrchestrasListError,
  selectOrchestrasListStatus,
} from "@/features/agents/redux/orchestras/selectors";
import { useEnsureAgentsLoaded } from "@/features/agents/orchestras/hooks/useEnsureAgentsLoaded";
import { buildAgentOrgForest, type OrchestraShape } from "./buildAgentOrgForest";

export function useAgentOrgChart(opts: { rootIds?: string[] } = {}) {
  const dispatch = useAppDispatch();
  useEnsureAgentsLoaded();
  const list = useAppSelector(selectOrchestrasList);
  const listStatus = useAppSelector(selectOrchestrasListStatus);
  const listError = useAppSelector(selectOrchestrasListError);
  const entries = useAppSelector(selectOrchestraEntries);
  const manualEdges = useAppSelector(selectManualOrgEdges);
  const manualError = useAppSelector(selectManualOrgError);
  const agents = useAppSelector(selectAllAgents);

  useEffect(() => {
    dispatch(fetchOrchestras());
  }, [dispatch]);

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

  // Everything reachable from the roots (both kinds of link), or everyone.
  const reachable = new Set<string>();
  if (!opts.rootIds) {
    for (const id of [...conductorIds, ...Object.keys(agents)]) reachable.add(id);
    for (const o of orchestras.values()) o.members.forEach((m) => reachable.add(m.agentId));
  } else {
    const manualKids = new Map<string, string[]>();
    for (const e of manualEdges) manualKids.set(e.managerId, [...(manualKids.get(e.managerId) ?? []), e.reportId]);
    const stack = [...opts.rootIds];
    while (stack.length) {
      const id = stack.pop() as string;
      if (reachable.has(id)) continue;
      reachable.add(id);
      orchestras.get(id)?.members.forEach((m) => stack.push(m.agentId));
      stack.push(...(manualKids.get(id) ?? []));
    }
  }

  // Load every reachable Orchestra not yet loaded, and every reachable agent's
  // manual reports. Each pass can reveal a deeper level; this re-runs until
  // nothing new appears.
  const toLoad = [...reachable]
    .filter((id) => conductorIds.has(id) && !entries[id])
    .sort()
    .join(",");
  useEffect(() => {
    if (!toLoad) return;
    for (const id of toLoad.split(",")) dispatch(loadOrchestra(id));
  }, [dispatch, toLoad]);

  const managerKey = [...reachable].sort().join(",");
  useEffect(() => {
    if (!managerKey) return;
    dispatch(loadManualOrgEdges(managerKey.split(",")));
  }, [dispatch, managerKey]);

  const nameOf = (id: string) => agents[id]?.name ?? "";

  const forest = buildAgentOrgForest({
    orchestras,
    conductorIds,
    failedIds,
    manualEdges,
    rootIds: opts.rootIds,
    nameOf,
  });

  const loading =
    listStatus === "loading" ||
    listStatus === "idle" ||
    [...reachable].some((id) => conductorIds.has(id) && entries[id]?.status !== "ready" && entries[id]?.status !== "error");

  return {
    forest,
    orchestras,
    conductorIds,
    manualEdges,
    loading,
    error:
      listError ??
      manualError ??
      (failedIds.size
        ? `${failedIds.size} Orchestra${failedIds.size === 1 ? "" : "s"} could not be loaded; ${failedIds.size === 1 ? "its" : "their"} team${failedIds.size === 1 ? " is" : "s are"} not shown.`
        : null),
  };
}
