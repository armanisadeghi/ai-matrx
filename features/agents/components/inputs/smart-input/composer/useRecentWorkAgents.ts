"use client";

/**
 * "Recent" in the Work agent panel (Amendment 1, A3): the last three agents
 * this person started conversations with.
 *
 * Answer to open question 10: derived from `chat.conversation`, no new table.
 * `cx_conversation_created_by_updated_idx (created_by, updated_at DESC) WHERE
 * deleted_at IS NULL` serves it; measured ~0.5 ms on the heaviest account
 * (18,115 conversations). The default chat agent (Custom) and the chat presets
 * are skipped — they have their own home in Chat mode, and the default would
 * otherwise fill every slot.
 *
 * BOUNDED BY DESIGN — not a complete list: the newest 200 conversations are
 * enough to find three distinct agents (the heaviest account had 22 distinct
 * agents in its newest 200), so this is a window, never a set to diff.
 */

import { useEffect, useState } from "react";
import { useAgentCatalogRows } from "@ai-matrx/agents/catalog/react";
import { createClient } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";

const RECENT_WINDOW = 200;
const RECENT_COUNT = 3;

export interface RecentWorkAgent {
  id: string;
  name: string;
}

export type RecentWorkAgentsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; agents: RecentWorkAgent[] };

export function useRecentWorkAgents(
  enabled: boolean,
  excludeIds: readonly (string | null | undefined)[],
): RecentWorkAgentsState {
  const userId = useAppSelector((state) => state.userAuth?.id ?? null);
  const rows = useAgentCatalogRows();
  const [agentIds, setAgentIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data, error: readError } = await supabase
        .schema("chat")
        .from("conversation")
        .select("initial_agent_id, updated_at")
        .eq("created_by", userId)
        .is("deleted_at", null)
        .not("initial_agent_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(RECENT_WINDOW);
      if (cancelled) return;
      if (readError) {
        console.error("[composer] recent agents could not be read", readError);
        setError(readError.message || "Your recent agents could not be read.");
        return;
      }
      const seen: string[] = [];
      for (const row of data ?? []) {
        const id = row.initial_agent_id;
        if (id && !seen.includes(id)) seen.push(id);
      }
      setError(null);
      setAgentIds(seen);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  if (error) return { status: "error", message: error };
  if (!agentIds) return { status: "loading" };
  const excluded = new Set(excludeIds.filter((id): id is string => Boolean(id)));
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const agents: RecentWorkAgent[] = [];
  for (const id of agentIds) {
    if (excluded.has(id)) continue;
    const row = byId.get(id);
    // An agent this person can no longer see (unshared, deleted) is not offered.
    if (!row || row.isArchived) continue;
    agents.push({ id, name: row.name ?? "Untitled agent" });
    if (agents.length === RECENT_COUNT) break;
  }
  return { status: "ready", agents };
}
