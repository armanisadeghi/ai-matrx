"use client";

// features/masterwork/understudy/refresh.ts
//
// The Understudy — the system that runs from minute one (vision doc 13;
// vocabulary ruled 2026-08-17). aidream keeps ONE crude one-agent Masterwork
// per Rulebook, rebuilt free and in place from the current rules. This module
// is the FE half of the auto-rebuild contract: poke the refresh endpoint after
// every rules write and at Rulebook creation, fire-and-forget — the server
// funnel (the Scout's rulebook tool) pokes it on its own for interview writes.

import { callApi } from "@/lib/api/call-api";
import { operationFailed } from "@/utils/errors";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import type { paths } from "@/types/python-generated/api-types";

/**
 * The refresh endpoint. Ships with this change in aidream; the cast becomes a
 * plain `satisfies keyof paths` the moment `pnpm sync-types` picks up the
 * route (the CHECKUP_PATH precedent).
 */
export const UNDERSTUDY_REFRESH_PATH =
  "/masterworks/understudy/refresh" as keyof paths;

export interface UnderstudyRefreshResult {
  workflow_id: string;
  created: boolean;
  approved_rules: number;
  unconfirmed_rules: number;
  rulebook_version: number;
}

/**
 * Create or rebuild the Rulebook's Understudy. Idempotent and free on the
 * server (no AI call) — safe to call on every save. Throws on a real failure
 * so interactive callers (the Understudy card's self-heal) can say so.
 */
export async function refreshUnderstudy(
  rulebookId: string,
): Promise<UnderstudyRefreshResult> {
  const store = getStoreSingleton();
  if (!store) throw new Error("Store not ready");
  const result = await store.dispatch(
    callApi({
      path: UNDERSTUDY_REFRESH_PATH,
      method: "POST",
      body: { rulebook_id: rulebookId } as never,
    }),
  );
  const error = (result as { error?: { message?: string } }).error;
  if (error) {
    throw operationFailed("refresh the Understudy", error);
  }
  const data = (result as { data?: UnderstudyRefreshResult }).data;
  if (!data) throw new Error("The Understudy refresh returned no result.");
  return data;
}

/**
 * THE STALENESS LEDGER — what the last refresh of each Rulebook's Understudy
 * did, readable by the card that shows the stand-in.
 *
 * `pokeUnderstudy` used to `console.error` a failure and stop there. Nobody
 * reads a console: on 2026-09-12 every refresh returned HTTP 500 for two hours
 * (the server write named no actor system, so Postgres refused it), the
 * Understudy stayed frozen at zero approved rules, and an Expert reviewed 94
 * rules and then tested a stand-in that had never seen one of them — while the
 * page above the run box read "88 approved". A failure the user cannot see is
 * the same defect as no failure handling at all.
 *
 * So the outcome is recorded here and subscribed to by `UnderstudyCard`, which
 * says in plain English that the stand-in is behind the rules and offers the
 * retry. Per-tab memory only — the truth of record is the workflow row's own
 * `rulebook_version` / `understudy_refreshed_at`, which the card also shows.
 */
export interface UnderstudyRefreshState {
  /** A refresh is in flight right now. */
  pending: boolean;
  /** The last failure, still unrepaired by a later success. */
  failed: boolean;
  /** What went wrong, for the card's detail line. */
  message: string | null;
  /** When the last attempt finished (epoch ms). */
  at: number | null;
}

const IDLE: UnderstudyRefreshState = {
  pending: false,
  failed: false,
  message: null,
  at: null,
};

const states = new Map<string, UnderstudyRefreshState>();
const listeners = new Set<() => void>();

function setState(rulebookId: string, next: UnderstudyRefreshState): void {
  states.set(rulebookId, next);
  for (const listener of listeners) listener();
}

/** Subscribe to every refresh outcome (for `useSyncExternalStore`). */
export function subscribeToUnderstudyRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The last known refresh outcome for one Rulebook. Stable while unchanged. */
export function getUnderstudyRefreshState(
  rulebookId: string,
): UnderstudyRefreshState {
  return states.get(rulebookId) ?? IDLE;
}

/**
 * Run a refresh and record the outcome in the ledger above. Interactive
 * callers (the card's retry) await it; `pokeUnderstudy` does not.
 */
export async function refreshUnderstudyTracked(
  rulebookId: string,
): Promise<UnderstudyRefreshResult> {
  setState(rulebookId, { pending: true, failed: false, message: null, at: null });
  try {
    const result = await refreshUnderstudy(rulebookId);
    setState(rulebookId, {
      pending: false,
      failed: false,
      message: null,
      at: Date.now(),
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setState(rulebookId, {
      pending: false,
      failed: true,
      message,
      at: Date.now(),
    });
    throw err;
  }
}

/**
 * Fire-and-forget refresh for write funnels (saveRules, Rulebook creation).
 * Never blocks the save — but never swallows the failure either: the outcome
 * lands in the staleness ledger above, so the Understudy card can say the
 * stand-in is behind the rules and offer a retry.
 */
export function pokeUnderstudy(rulebookId: string): void {
  void refreshUnderstudyTracked(rulebookId).catch((err) => {
    console.error(
      "[understudy] refresh failed — the running system is now stale relative to the rules",
      { rulebookId, err },
    );
  });
}
