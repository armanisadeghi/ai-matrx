/**
 * An agent's Agent Factory proof status, for the badge every agent list shows.
 *
 * Read off `agent.definition.metadata` (React → Supabase under the reader's RLS):
 * `agent_factory_build.outcome` + `kept_unproven` (the pipeline's record) and
 * `agent_factory_first_runs.status` (the R34 judgment of its first 3 real runs).
 * Ids asked for in the same tick are loaded in ONE query (a grid of cards = one read).
 */

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

/** `unproven` = saved unproven / kept anyway, first runs not judged yet. */
export type AgentProofStatus = "unproven" | "failed_proof" | null;

interface Row {
  id: string;
  outcome: string | null;
  kept: unknown;
  first_runs: string | null;
}

const cache = new Map<string, AgentProofStatus>();
const waiting = new Map<string, Array<(s: AgentProofStatus) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function proofStatusOf(row: Pick<Row, "outcome" | "kept" | "first_runs">): AgentProofStatus {
  const unproven = row.outcome === "saved_unproven" || Boolean(row.kept);
  if (!unproven) return null;
  if (row.first_runs === "passed") return null;
  if (row.first_runs === "failed") return "failed_proof";
  return "unproven";
}

async function flush(): Promise<void> {
  timer = null;
  const ids = [...waiting.keys()];
  const callbacks = new Map(waiting);
  waiting.clear();
  let rows: Row[] = [];
  try {
    const { data } = await createClient()
      .schema("agent")
      .from("definition")
      .select(
        "id, outcome:metadata->agent_factory_build->>outcome, kept:metadata->agent_factory_build->kept_unproven, first_runs:metadata->agent_factory_first_runs->>status" as string,
      )
      .in("id", ids);
    rows = (data ?? []) as unknown as Row[];
  } catch {
    rows = [];
  }
  const byId = new Map(rows.map((r) => [r.id, proofStatusOf(r)]));
  for (const id of ids) {
    const status = byId.get(id) ?? null;
    cache.set(id, status);
    for (const cb of callbacks.get(id) ?? []) cb(status);
  }
}

function load(id: string, cb: (s: AgentProofStatus) => void): void {
  const list = waiting.get(id) ?? [];
  list.push(cb);
  waiting.set(id, list);
  if (!timer) timer = setTimeout(() => void flush(), 0);
}

/** The agent's proof status; null while loading or for an agent with nothing to badge. */
export function useAgentProofStatus(agentId: string | null | undefined): AgentProofStatus {
  const [status, setStatus] = useState<AgentProofStatus>(agentId ? (cache.get(agentId) ?? null) : null);
  useEffect(() => {
    if (!agentId || cache.has(agentId)) {
      setStatus(agentId ? (cache.get(agentId) ?? null) : null);
      return undefined;
    }
    let live = true;
    load(agentId, (s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, [agentId]);
  return status;
}
