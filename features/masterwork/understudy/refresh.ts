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
    throw new Error(error.message ?? "The Understudy could not be refreshed.");
  }
  const data = (result as { data?: UnderstudyRefreshResult }).data;
  if (!data) throw new Error("The Understudy refresh returned no result.");
  return data;
}

/**
 * Fire-and-forget refresh for write funnels (saveRules, Rulebook creation).
 * Never blocks the save; failure is loud in the console, never a user error —
 * the next save pokes again, and the card self-heals on mount.
 */
export function pokeUnderstudy(rulebookId: string): void {
  void refreshUnderstudy(rulebookId).catch((err) => {
    console.error(
      "[understudy] refresh failed — the running system is now stale relative to the rules",
      { rulebookId, err },
    );
  });
}
