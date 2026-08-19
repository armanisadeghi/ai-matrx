/**
 * features/admin/producer-yield/api.ts
 *
 * Contract-bound client for aidream's `/admin/producer-yield` surface.
 */
import { apiGet } from "@/lib/api/typed-client";
import { postJson } from "@/lib/python-client";

import type { ProducerYieldOut, YieldCheckOut } from "./types";

export async function getProducerYield(): Promise<ProducerYieldOut> {
  const { data } = await apiGet("/admin/producer-yield");
  return data;
}

/**
 * Run the floor pass now. The scheduled task (`producer_yield_floor`, hourly at
 * :47) does this on its own; this is the manual trigger. Declares no request
 * body in the contract, so it uses the `postJson` escape hatch with a
 * contract-derived response type — same pattern as `/hindsight/drain`.
 */
export async function runYieldCheck(): Promise<YieldCheckOut> {
  const { data } = await postJson<YieldCheckOut, undefined>(
    "/admin/producer-yield/check",
    undefined,
  );
  return data;
}
