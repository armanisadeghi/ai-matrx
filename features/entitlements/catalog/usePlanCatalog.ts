"use client";

// features/entitlements/catalog/usePlanCatalog.ts
//
// The render face of the plan catalog. Pass `initialPlans` when a server
// component already read it (no client fetch then); otherwise the first
// mount starts the one shared read.

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getPlanCatalogState,
  loadPlanCatalog,
  seedPlanCatalog,
  subscribePlanCatalog,
  type PlanCatalogState,
} from "./service";
import type { CatalogPlan } from "./types";

const SERVER_STATE: PlanCatalogState = { status: "idle" };

export function usePlanCatalog(initialPlans?: CatalogPlan[]): PlanCatalogState {
  // The server snapshot is fixed per mount (hydration must match the SSR html).
  const [serverState] = useState<PlanCatalogState>(() =>
    initialPlans ? { status: "ready", plans: initialPlans } : SERVER_STATE,
  );
  // Seed only in the browser: a server module cache would outlive the request
  // and keep serving yesterday's prices after a plan row changes.
  if (initialPlans && typeof window !== "undefined") seedPlanCatalog(initialPlans);
  const state = useSyncExternalStore(subscribePlanCatalog, getPlanCatalogState, () => serverState);
  const needsRead = state.status === "idle";
  useEffect(() => {
    if (!needsRead) return;
    // The failure is recorded in the shared state (and logged) by the reader.
    loadPlanCatalog().catch(() => undefined);
  }, [needsRead]);
  return state;
}
