// features/entitlements/catalog/server.ts
//
// The server-side read of `billing.plan_catalog()` for server-rendered pages
// (the public /pricing route). The RPC is granted to anon, so a signed-out
// visitor's request reads it as well. A failure is returned, never hidden.

import "server-only";
import { createClient } from "@/utils/supabase/server";
import { parsePlanCatalog } from "./parse";
import type { CatalogPlan } from "./types";

export type PlanCatalogRead = { ok: true; plans: CatalogPlan[] } | { ok: false; reason: string };

export async function readPlanCatalogServer(): Promise<PlanCatalogRead> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.schema("billing").rpc("plan_catalog");
    if (error) {
      console.error("[plan-catalog] billing.plan_catalog() refused on the server:", error.message);
      return { ok: false, reason: error.message || "the plan catalog read was refused" };
    }
    return { ok: true, plans: parsePlanCatalog(data) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[plan-catalog] billing.plan_catalog() failed on the server:", reason);
    return { ok: false, reason };
  }
}
