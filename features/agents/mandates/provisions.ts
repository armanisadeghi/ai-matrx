"use client";

/**
 * Provisions — client reads for the Mandate input model (Wave 2).
 *
 * The pure shapes (offered values, the consumption-map funnel, wave-1 column
 * parsers, the pre-flight) live in the leaf module `./provision-shapes.ts` so
 * the SSR resolver can share them; THIS module owns the browser reads of
 * `agent.provision` (RLS — provisions are public platform rows, same posture
 * as `agent.mandate`) plus their cache.
 *
 * ── LOCAL DB-TYPE EXTENSION — DELETE when `pnpm db-types` can run here ──────
 * `agent.provision` is LIVE (columns verified against information_schema on
 * 2026-08-22) but missing from the generated `types/database.types.ts`: the
 * Supabase CLI needs an access token this environment doesn't have, and the
 * direct `--db-url` path is blocked by the HTTPS-only network.
 * `ProvisionRowLocal` mirrors the live schema written by aidream's code-owned
 * boot sync (`sync_declared_provisions`), and every field read is
 * runtime-validated at ingress — the widened client type is never trusted on
 * its own. Once `pnpm db-types` runs, replace the local Row + `Wave1Database`
 * widening with the generated types.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import type { Database, Json } from "@/types/database.types";
import { parseOfferedValues, type OfferedValue } from "./provision-shapes";

export type {
  BindingWave1Fields,
  ConsumptionEntry,
  ConsumptionMap,
  MandateWave1Fields,
  OfferedValue,
} from "./provision-shapes";
export {
  ALLOWED_PIN_KEYS,
  consumptionMapProblems,
  GENERIC_VALUE_KINDS,
  parseBindingWave1,
  parseConsumptionMap,
  parseMandateWave1,
  parseOfferedValues,
  SCALAR_VALUE_KINDS,
} from "./provision-shapes";

/** Local Row mirror of `agent.provision` (columns verified live 2026-08-22).
 * Code-owned rows: aidream's boot sync wholesale-refreshes every column. */
interface ProvisionRowLocal {
  id: string;
  provision_key: string;
  label: string;
  description: string | null;
  offered_values: Json;
  derived_input_kind: string | null;
  code_path: string | null;
  is_enabled: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  organization_id: string;
  metadata: Json;
  version: number;
}

type AgentSchema = Database["agent"];
type Wave1AgentSchema = Omit<AgentSchema, "Tables"> & {
  Tables: AgentSchema["Tables"] & {
    provision: {
      Row: ProvisionRowLocal;
      Insert: never;
      Update: never;
      Relationships: [];
    };
  };
};
type Wave1Database = Omit<Database, "agent"> & { agent: Wave1AgentSchema };

/** The ONE widening for the missing generated table (see the header note) —
 * the same authenticated client instance, with `agent.provision` visible.
 * Every field read off it goes through the runtime parsers. */
function wave1Client(): SupabaseClient<Wave1Database> {
  return createClient() as unknown as SupabaseClient<Wave1Database>;
}

export interface ProvisionOffer {
  id: string;
  provisionKey: string;
  label: string;
  description: string;
  /** The derived input kind for the whole offer (`<provision_key>.offer`) —
   * registered in content_ir by aidream's boot sync. */
  offerKindSlug: string | null;
  values: OfferedValue[];
  isEnabled: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const provisionCache = new Map<
  string,
  { at: number; value: ProvisionOffer | null }
>();

/**
 * Fetch one provision by key. Returns null when no live row exists; the
 * CALLER decides how loud that is (a mandate naming a missing provision is a
 * data defect; a mandate with no provision_key never calls this).
 */
export async function fetchProvision(
  provisionKey: string,
): Promise<ProvisionOffer | null> {
  const cached = provisionCache.get(provisionKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const { data, error } = await wave1Client()
    .schema("agent")
    .from("provision")
    .select("*")
    .eq("provision_key", provisionKey)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;

  const value: ProvisionOffer | null = data
    ? {
        id: data.id,
        provisionKey: data.provision_key,
        label: data.label,
        description: data.description ?? "",
        offerKindSlug: data.derived_input_kind,
        values: parseOfferedValues(data.offered_values),
        isEnabled: data.is_enabled,
      }
    : null;
  provisionCache.set(provisionKey, { at: Date.now(), value });
  return value;
}

/** Cache-bust hook (mirrors the mandate cache buses). */
export function invalidateProvisionCache(provisionKey?: string): void {
  if (provisionKey) provisionCache.delete(provisionKey);
  else provisionCache.clear();
}
