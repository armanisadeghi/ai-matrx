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
  /**
   * What the last SUCCESSFUL rebuild built — the version it baked in and the
   * rule counts it saw. Survives a later failure (the stand-in really is still
   * performing from that build) and is what lets the card stop saying "behind
   * your rules" the moment a rebuild lands, without reloading the workflow row.
   */
  result: UnderstudyRefreshResult | null;
  /**
   * When that SUCCESSFUL rebuild landed (epoch ms) — never the same thing as
   * `at`, which moves on every attempt. `at` is cleared when a new poke starts
   * and rewritten when one FAILS, so dating the surviving `result` by `at`
   * would stamp a build that landed at 23:40 with the time a later failure
   * gave up. The card says "rebuilt <time>" about a build, so it reads this.
   */
  resultAt: number | null;
}

const IDLE: UnderstudyRefreshState = {
  pending: false,
  failed: false,
  message: null,
  at: null,
  result: null,
  resultAt: null,
};

const states = new Map<string, UnderstudyRefreshState>();
const listeners = new Set<() => void>();

/**
 * THE GENERATION TOKEN. The review wizard saves once per rule, so two or three
 * pokes for one Rulebook are in flight at once as a matter of course (95 of
 * them in two hours on 2026-09-12). Network order is not start order: without
 * this counter an older poke settling late overwrote a newer outcome — an
 * older failure burying a success that landed, or an older success hiding a
 * failure the Expert needed to see. Only the newest attempt may write.
 */
const generations = new Map<string, number>();

function startGeneration(rulebookId: string): number {
  const next = (generations.get(rulebookId) ?? 0) + 1;
  generations.set(rulebookId, next);
  return next;
}

function isCurrent(rulebookId: string, generation: number): boolean {
  return generations.get(rulebookId) === generation;
}

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
  const generation = startGeneration(rulebookId);
  const previous = getUnderstudyRefreshState(rulebookId);
  setState(rulebookId, {
    pending: true,
    failed: false,
    message: null,
    at: null,
    result: previous.result,
    resultAt: previous.resultAt,
  });
  try {
    const result = await refreshUnderstudy(rulebookId);
    // A poke that started earlier may land later. It still did its work on the
    // server, but it is no longer what the card should report.
    if (isCurrent(rulebookId, generation)) {
      const landedAt = Date.now();
      setState(rulebookId, {
        pending: false,
        failed: false,
        message: null,
        at: landedAt,
        result,
        resultAt: landedAt,
      });
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isCurrent(rulebookId, generation)) {
      setState(rulebookId, {
        pending: false,
        failed: true,
        message,
        at: Date.now(),
        // The stand-in is still performing from the last build that landed —
        // keep it, AND keep the time it landed, so the banner can name the
        // version it is actually running without dating it to this failure.
        result: getUnderstudyRefreshState(rulebookId).result,
        resultAt: getUnderstudyRefreshState(rulebookId).resultAt,
      });
    }
    throw err;
  }
}

/**
 * What the card must say about the stand-in right now: which Rulebook version
 * it is performing from, the rule counts baked into it, and whether it is
 * behind the Rulebook. Lives here rather than in the card so the honesty of
 * the amber banner is testable without rendering React.
 */
export interface UnderstudyStandIn {
  /** The Rulebook version the stand-in was built from, when known. */
  builtFromVersion: number | null;
  /** Approved rules baked into that build. */
  approved: number | null;
  /** Rules still in review at that build. */
  unconfirmed: number | null;
  /** When that build happened (ISO), from whichever account is newer. */
  rebuiltAt: string | null;
  /** The stand-in is older than the Rulebook — the amber banner's condition. */
  behind: boolean;
}

/** The Understudy workflow row's side of the comparison. */
export interface UnderstudyRowFacts {
  rulebook_version: number | null;
  approved: number | null;
  unconfirmed: number | null;
  refreshed_at: string | null;
}

export function readUnderstudyStandIn(
  refresh: UnderstudyRefreshState,
  row: UnderstudyRowFacts | null,
  rulebookVersion: number,
): UnderstudyStandIn {
  // Two accounts of the same build: the workflow row the page loaded (which
  // goes stale the moment a save pokes a rebuild) and the payload the rebuild
  // itself returned. Believe whichever is NEWER — that is what the stand-in
  // will actually perform from, and it is why a successful rebuild takes the
  // amber banner down without a reload.
  const rebuilt = refresh.result;
  const rowVersion = row?.rulebook_version ?? null;
  const useRebuild =
    rebuilt !== null &&
    (rowVersion === null || rebuilt.rulebook_version >= rowVersion);
  const builtFromVersion = useRebuild
    ? rebuilt.rulebook_version
    : (rowVersion ?? null);
  return {
    builtFromVersion,
    approved: useRebuild ? rebuilt.approved_rules : (row?.approved ?? null),
    unconfirmed: useRebuild
      ? rebuilt.unconfirmed_rules
      : (row?.unconfirmed ?? null),
    // `resultAt`, never `at`: the time the surviving build LANDED, not when
    // the last attempt (which may have failed, or may still be running) ended.
    rebuiltAt: useRebuild
      ? refresh.resultAt !== null
        ? new Date(refresh.resultAt).toISOString()
        : (row?.refreshed_at ?? null)
      : (row?.refreshed_at ?? null),
    behind: builtFromVersion !== null && builtFromVersion < rulebookVersion,
  };
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
