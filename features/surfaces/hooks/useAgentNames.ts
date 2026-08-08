"use client";

/**
 * useAgentNames — resolve agent display names by id from `agent.definition`.
 *
 * The canonical name source for role-bound agents: definition-tier agents
 * (no visible `agent.card` row) still resolve here as long as RLS lets the
 * caller read the row. Ids RLS hides simply stay unresolved — callers fall
 * back to their own label (e.g. the role label).
 *
 * Module-scoped cache + in-flight dedup so repeated mounts (context menus,
 * chrome panels) collapse to one network call per unseen id set.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

const nameCache = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();

async function fetchNames(ids: string[]): Promise<void> {
  const key = ids.slice().sort().join(",");
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = (async () => {
    const { data, error } = await createClient()
      .schema("agent")
      .from("definition")
      .select("id, name")
      .is("deleted_at", null)
      .in("id", ids);
    if (error) {
      console.error(
        "[useAgentNames] agent.definition name fetch FAILED — role rows will fall back to role labels",
        { ids, error },
      );
      return;
    }
    for (const row of (data ?? []) as { id: string; name: string | null }[]) {
      nameCache.set(row.id, row.name ?? "Unnamed agent");
    }
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, request);
  return request;
}

/**
 * Returns a map of `agentId → name` for every id resolvable by the caller.
 * Unresolvable ids (RLS-hidden, deleted) are absent from the map.
 */
export function useAgentNames(
  agentIds: readonly string[],
): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});

  const key = [...new Set(agentIds)].sort().join(",");

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const missing = ids.filter((id) => !nameCache.has(id));
    const apply = () => {
      setNames((prev) => {
        const next: Record<string, string> = { ...prev };
        let changed = false;
        for (const id of ids) {
          const name = nameCache.get(id);
          if (name && next[id] !== name) {
            next[id] = name;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    if (missing.length === 0) {
      apply();
      return;
    }
    let cancelled = false;
    void fetchNames(missing).then(() => {
      if (!cancelled) apply();
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
}
