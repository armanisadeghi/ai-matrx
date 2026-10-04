// features/entitlements/catalog/service.ts
//
// The browser reader of `billing.plan_catalog()` — read once per page session,
// shared by every surface (pricing grid, upgrade dialogs, paywall, nudges).
// One in-flight request at a time; a failure is kept and reported, never
// replaced by a made-up plan list. `seedPlanCatalog` lets a server-rendered
// page hand its SSR read to the client so the first paint needs no fetch.

import { createClient } from "@/utils/supabase/client";
import { parsePlanCatalog } from "./parse";
import type { CatalogPlan } from "./types";

export type PlanCatalogState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; plans: CatalogPlan[] }
  | { status: "error"; reason: string };

let state: PlanCatalogState = { status: "idle" };
let inflight: Promise<CatalogPlan[]> | null = null;
const listeners = new Set<() => void>();

function setState(next: PlanCatalogState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribePlanCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlanCatalogState(): PlanCatalogState {
  return state;
}

/** Hand a server-side read to the browser cache (no-op once the cache holds plans). */
export function seedPlanCatalog(plans: CatalogPlan[]): void {
  if (state.status === "ready") return;
  state = { status: "ready", plans };
}

/** The catalog, fetched at most once per session (a failed read may be retried). */
export function loadPlanCatalog(): Promise<CatalogPlan[]> {
  if (state.status === "ready") return Promise.resolve(state.plans);
  if (inflight) return inflight;
  setState({ status: "loading" });
  inflight = (async () => {
    try {
      const { data, error } = await createClient().schema("billing").rpc("plan_catalog");
      if (error) throw new Error(error.message || "the plan catalog read was refused");
      const plans = parsePlanCatalog(data);
      setState({ status: "ready", plans });
      return plans;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[plan-catalog] billing.plan_catalog() could not be read:", reason);
      setState({ status: "error", reason });
      throw err instanceof Error ? err : new Error(reason);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
