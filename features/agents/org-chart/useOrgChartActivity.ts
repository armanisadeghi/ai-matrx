// features/agents/org-chart/useOrgChartActivity.ts
//
// LIVE ACTIVITY across the whole org chart: for every agent box, is it running
// right now, and how did its last run end. Company-wide — every run the viewer
// may see (row security on chat.user_request decides), from any surface,
// schedule or Orchestra, not only runs started in this browser tab.
//
// Source: chat.user_request (one row per run; `agent_id`, `status`,
// `last_activity_at`). It is in the `supabase_realtime` publication, so one
// channel keeps the chart current; a reconnect re-reads (realtime has no replay).
// How far back "last run" looks and when a silent run counts as stalled are
// knobs: agents.org_chart.activity_window_hours / stalled_after_minutes.

"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { defineChannelNamespace } from "@ai-matrx/realtime";
import { useChannel } from "@ai-matrx/realtime/react";
import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { knobInts } from "@/lib/knobs/featureKnobs";
import { ORG_CHART_READ_CHUNK } from "./constants";

export type AgentActivityState = "running" | "stalled" | "done" | "failed" | "stopped";

export interface AgentActivity {
  state: AgentActivityState;
  /** When it last moved (running) or ended. ISO. */
  at: string;
  /** Runs in progress right now (an agent can run several at once). */
  running: number;
}

interface RunRow {
  id: string;
  agent_id: string | null;
  status: string;
  created_at: string;
  last_activity_at: string | null;
  completed_at: string | null;
}

const COLUMNS = "id, agent_id, status, created_at, last_activity_at, completed_at";
const IN_PROGRESS = new Set(["pending", "processing"]);

const activityChannel = defineChannelNamespace({
  namespace: "org-chart-activity",
  parts: ["viewer"],
  description: "chat.user_request rows the viewer may see, for live org chart activity",
});

interface Knobs {
  activity_window_hours: number;
  stalled_after_minutes: number;
}

/** One agent's activity from its runs in the window (newest first not required). */
export function summarize(runs: readonly RunRow[], stalledAfterMs: number, now = Date.now()): AgentActivity | null {
  let latestEnd: RunRow | null = null;
  let freshest: RunRow | null = null;
  let running = 0;
  let stalled = 0;
  for (const r of runs) {
    const moved = r.last_activity_at ?? r.created_at;
    if (IN_PROGRESS.has(r.status)) {
      if (now - Date.parse(moved) <= stalledAfterMs) {
        running += 1;
        if (!freshest || moved > (freshest.last_activity_at ?? freshest.created_at)) freshest = r;
      } else stalled += 1;
      continue;
    }
    const ended = r.completed_at ?? moved;
    if (!latestEnd || ended > (latestEnd.completed_at ?? latestEnd.last_activity_at ?? latestEnd.created_at)) {
      latestEnd = r;
    }
  }
  if (running && freshest) {
    return { state: "running", at: freshest.last_activity_at ?? freshest.created_at, running };
  }
  if (stalled) {
    const r = runs.find((x) => IN_PROGRESS.has(x.status)) as RunRow;
    return { state: "stalled", at: r.last_activity_at ?? r.created_at, running: 0 };
  }
  if (!latestEnd) return null;
  const at = latestEnd.completed_at ?? latestEnd.last_activity_at ?? latestEnd.created_at;
  const state: AgentActivityState =
    latestEnd.status === "completed" ? "done" : latestEnd.status === "failed" || latestEnd.status === "abandoned" ? "failed" : "stopped";
  return { state, at, running: 0 };
}

async function readRuns(agentIds: readonly string[], since: string): Promise<RunRow[]> {
  const out: RunRow[] = [];
  for (let i = 0; i < agentIds.length; i += ORG_CHART_READ_CHUNK) {
    const chunk = agentIds.slice(i, i + ORG_CHART_READ_CHUNK);
    const rows = await readAllRows<RunRow>(
      ({ from, to }) =>
        supabase
          .schema("chat")
          .from("user_request")
          .select(COLUMNS, { count: "exact" })
          .in("agent_id", chunk)
          .is("deleted_at", null)
          .or(`created_at.gte.${since},status.in.(pending,processing)`)
          .order("id", { ascending: true })
          .range(from, to),
      { label: "chat.user_request org chart activity" },
    );
    out.push(...rows);
  }
  return out;
}

export interface OrgChartActivity {
  byAgentId: Record<string, AgentActivity>;
  /** The read failed: said on screen, never shown as "nothing ran". */
  error: string | null;
}

/** Live activity for these agents. One read per agent set, then one channel. */
export function useOrgChartActivity(agentIds: readonly string[]): OrgChartActivity {
  const [knobs, setKnobs] = useState<Knobs | null>(null);
  const [runs, setRuns] = useState<Map<string, RunRow>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [readTick, setReadTick] = useState(0);
  // Re-evaluate "running" vs "stalled" and the "x ago" words as time passes.
  const [now, setNow] = useState(() => Date.now());
  const idsKey = [...new Set(agentIds)].sort().join(",");

  useEffect(() => {
    let live = true;
    knobInts("agents.org_chart", ["activity_window_hours", "stalled_after_minutes"] as const)
      .then((k) => live && setKnobs(k))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Activity settings could not load."));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!knobs || !idsKey) return;
    let live = true;
    const since = new Date(Date.now() - knobs.activity_window_hours * 3_600_000).toISOString();
    readRuns(idsKey.split(","), since)
      .then((rows) => {
        if (!live) return;
        setRuns(new Map(rows.map((r) => [r.id, r])));
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Activity could not load."));
    return () => {
      live = false;
    };
  }, [knobs, idsKey, readTick]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const wanted = new Set(idsKey ? idsKey.split(",") : []);
  useChannel(
    idsKey
      ? {
          topic: activityChannel.topic({ viewer: "me" }),
          postgresChanges: [
            {
              event: "*",
              schema: "chat",
              table: "user_request",
              rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
              fingerprint: (row) => JSON.stringify([row.status ?? null, row.last_activity_at ?? null]),
              onChange: ({ row }) => {
                const r = row as unknown as RunRow;
                if (!r?.id || !r.agent_id || !wanted.has(r.agent_id)) return;
                setRuns((cur) => new Map(cur).set(r.id, r));
                setNow(Date.now());
              },
            },
          ],
          onBackfill: () => setReadTick((n) => n + 1),
        }
      : null,
  );

  const byAgent = new Map<string, RunRow[]>();
  for (const r of runs.values()) {
    if (!r.agent_id) continue;
    byAgent.set(r.agent_id, [...(byAgent.get(r.agent_id) ?? []), r]);
  }
  const byAgentId: Record<string, AgentActivity> = {};
  if (knobs) {
    for (const [id, list] of byAgent) {
      const a = summarize(list, knobs.stalled_after_minutes * 60_000, now);
      if (a) byAgentId[id] = a;
    }
  }
  return { byAgentId, error };
}

// ── distribution to cards (context, so a status tick never rebuilds the layout) ──

const ActivityContext = createContext<Record<string, AgentActivity>>({});
export const OrgChartActivityProvider = ActivityContext.Provider;

export function useAgentActivity(agentId: string | null): AgentActivity | null {
  const all = useContext(ActivityContext);
  return agentId ? (all[agentId] ?? null) : null;
}
