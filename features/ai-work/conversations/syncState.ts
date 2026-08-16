// features/ai-work/conversations/syncState.ts
//
// THE SYNC FACTS, in one place, for every surface that has to answer
// "is my Claude Code history actually arriving?"
//
// Arman asked repeatedly and the product had no answer, because the facts were
// already in the database and nothing read them together: `chat.coding_session`
// records status, fidelity, origin, and `last_seen_at` per delivered session,
// and its metadata carries the workspace and the provider account. This reader
// rolls those rows up per provider account and states the verdict — the
// connections page and the conversations list then RENDER the same object, so
// two surfaces can never disagree about whether sync is healthy.
//
// It reads through `readAllRows` on purpose: every number here is a COUNT the
// user will act on, and a silently-truncated 1000-row page would report a
// confident wrong total (FOUND_DEFECTS D190).

import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";
import {
  providerAccountIdentity,
  workspaceName,
} from "@/features/ai-work/lib/codingSessionPresentation";
import type { Json } from "@/types/database.types";

/** How stale a delivery can be before it stops meaning "sync is working". */
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface SyncRow {
  id: string;
  provider: string;
  status: string;
  fidelity: string;
  origin: string;
  last_seen_at: string;
  metadata: Json;
}

export type SyncFreshness = "live" | "recent" | "stale" | "none";

export interface SyncAccountState {
  /** Stable key for React and for grouping. */
  key: string;
  provider: string;
  /** Display-safe account label, or the honest "no identity reported". */
  accountLabel: string;
  accountReported: boolean;
  sessionCount: number;
  /** Newest delivery across this account's sessions, ISO or null. */
  lastSeenAt: string | null;
  freshness: SyncFreshness;
  /** How many sessions carry each fidelity, highest first. */
  fidelity: { value: string; count: number }[];
  /** How many sessions arrived by each origin (event mirror, import, …). */
  origin: { value: string; count: number }[];
  /** Sessions whose binding is not `active`. */
  inactiveCount: number;
  workspaces: string[];
}

export interface SyncStateSnapshot {
  accounts: SyncAccountState[];
  totalSessions: number;
  lastSeenAt: string | null;
  freshness: SyncFreshness;
}

export const EMPTY_SYNC_STATE: SyncStateSnapshot = {
  accounts: [],
  totalSessions: 0,
  lastSeenAt: null,
  freshness: "none",
};

function freshnessOf(lastSeenAt: string | null): SyncFreshness {
  if (!lastSeenAt) return "none";
  const age = Date.now() - Date.parse(lastSeenAt);
  if (!Number.isFinite(age)) return "none";
  if (age <= FRESH_WINDOW_MS) return "live";
  if (age <= STALE_WINDOW_MS) return "recent";
  return "stale";
}

export function freshnessLabel(freshness: SyncFreshness): string {
  switch (freshness) {
    case "live":
      return "Delivering";
    case "recent":
      return "Quiet this week";
    case "stale":
      return "Nothing for over a week";
    case "none":
      return "Nothing delivered yet";
  }
}

function tally(values: string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Every binding the signed-in owner has, rolled up per provider account.
 *
 * VIEW LAW: explicitly the caller's own delivery history (`created_by`), never
 * a bare RLS-filtered read.
 */
export async function readSyncState(): Promise<SyncStateSnapshot> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  if (!user) throw new Error("Sign in to see your sync state.");

  const rows = await readAllRows<SyncRow>(
    ({ from, to }) =>
      supabase
        .schema("chat")
        .from("coding_session")
        .select(
          "id, provider, status, fidelity, origin, last_seen_at, metadata",
          { count: "exact" },
        )
        .eq("created_by", user.id)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "chat.coding_session (sync state)" },
  );

  const groups = new Map<string, SyncRow[]>();
  for (const row of rows) {
    const identity = providerAccountIdentity(row.metadata);
    const key = `${row.provider}::${identity.reported ? identity.display : "__unreported__"}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const accounts: SyncAccountState[] = [...groups.entries()].map(
    ([key, group]) => {
      const identity = providerAccountIdentity(group[0].metadata);
      const lastSeenAt =
        group
          .map((row) => row.last_seen_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;
      const workspaces = [
        ...new Set(
          group
            .map((row) => workspaceName(row.metadata))
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort();

      return {
        key,
        provider: group[0].provider,
        accountLabel: identity.display,
        accountReported: identity.reported,
        sessionCount: group.length,
        lastSeenAt,
        freshness: freshnessOf(lastSeenAt),
        fidelity: tally(group.map((row) => row.fidelity)),
        origin: tally(group.map((row) => row.origin)),
        inactiveCount: group.filter((row) => row.status !== "active").length,
        workspaces,
      };
    },
  );

  accounts.sort(
    (a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") ||
      a.accountLabel.localeCompare(b.accountLabel),
  );

  const lastSeenAt = accounts[0]?.lastSeenAt ?? null;
  return {
    accounts,
    totalSessions: rows.length,
    lastSeenAt,
    freshness: freshnessOf(lastSeenAt),
  };
}
