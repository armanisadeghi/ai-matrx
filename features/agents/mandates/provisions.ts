"use client";

/**
 * Provisions — client reads for the Mandate input model (Wave 2).
 *
 * The pure shapes (offered values, the consumption-map funnel, wave-1 column
 * parsers, the pre-flight) live in the leaf module `./provision-shapes.ts` so
 * the SSR resolver can share them; THIS module owns the browser reads of
 * `agent.provision` (RLS — provisions are public platform rows, same posture
 * as `agent.mandate`) plus their cache. `agent.provision` is in the generated
 * `types/database.types.ts` (regenerated 2026-08-22); every field read is still
 * runtime-validated at ingress.
 */

import { createClient } from "@/utils/supabase/client";
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

  const { data, error } = await createClient()
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

/**
 * Fetch MANY provisions in one round trip — the list-surface read.
 *
 * `/agents/mandates` renders hundreds of mandates, most carrying a
 * `provision_key`; one `fetchProvision` per card would be a 200+ request
 * storm. Keys already cached are served from the cache and only the misses
 * are queried, in chunks (PostgREST `in.(...)` rides the URL, so an unbounded
 * key list would blow the request line). Missing keys are simply absent from
 * the returned map — a mandate naming a provision no row backs is a data
 * defect the CALLER decides how loudly to render.
 */
const PROVISION_BATCH_SIZE = 100;

export async function fetchProvisions(
  provisionKeys: readonly string[],
): Promise<Map<string, ProvisionOffer>> {
  const out = new Map<string, ProvisionOffer>();
  const misses: string[] = [];
  for (const key of new Set(provisionKeys)) {
    const cached = provisionCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      if (cached.value) out.set(key, cached.value);
      continue;
    }
    misses.push(key);
  }
  if (misses.length === 0) return out;

  const client = createClient();
  const chunks: string[][] = [];
  for (let i = 0; i < misses.length; i += PROVISION_BATCH_SIZE) {
    chunks.push(misses.slice(i, i + PROVISION_BATCH_SIZE));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      client
        .schema("agent")
        .from("provision")
        .select("*")
        .in("provision_key", chunk)
        .is("deleted_at", null),
    ),
  );

  const at = Date.now();
  const seen = new Set<string>();
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of data ?? []) {
      const offer: ProvisionOffer = {
        id: row.id,
        provisionKey: row.provision_key,
        label: row.label,
        description: row.description ?? "",
        offerKindSlug: row.derived_input_kind,
        values: parseOfferedValues(row.offered_values),
        isEnabled: row.is_enabled,
      };
      seen.add(row.provision_key);
      provisionCache.set(row.provision_key, { at, value: offer });
      out.set(row.provision_key, offer);
    }
  }
  // Negative-cache the keys that came back empty so a re-render doesn't
  // re-query them every pass (same TTL as a hit).
  for (const key of misses) {
    if (!seen.has(key)) provisionCache.set(key, { at, value: null });
  }
  return out;
}

/** Cache-bust hook (mirrors the mandate cache buses). */
export function invalidateProvisionCache(provisionKey?: string): void {
  if (provisionKey) provisionCache.delete(provisionKey);
  else provisionCache.clear();
}
