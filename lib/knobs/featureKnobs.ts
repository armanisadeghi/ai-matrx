// lib/knobs/featureKnobs.ts
//
// THE runtime reader for `platform.feature_knob` in this repo. The admin page
// (`features/admin/limits/`) could already WRITE knobs; nothing could read one
// at runtime, so every ceiling in the app stayed a constant and turning a knob
// changed nothing. This is the missing half.
//
// Contract (cross-repo SoR: common-docs/systems/feature-knobs/FEATURE.md):
//   - A MISSING knob RAISES. There is deliberately no constant to fall back on:
//     a frozen fallback is exactly the silent failure the knob system exists to
//     end. Seed the row in a migration, then read it here.
//   - Reads are cached for 60s, TTL-only. An admin writes straight to Postgres
//     from the browser, so there is no invalidation channel to build (or forget
//     to fire) and the value is live within a minute, everywhere.
//   - One fetch per window, shared: concurrent callers await the same promise,
//     so a kit fan-out asking eight generators for their knobs costs ONE query.

import { createClient } from "@/utils/supabase/client";

const TTL_MS = 60_000;

type KnobValue = unknown;

let cache: Map<string, KnobValue> | null = null;
let cachedAt = 0;
let inFlight: Promise<Map<string, KnobValue>> | null = null;

function addr(feature: string, key: string): string {
  return `${feature} ${key}`;
}

async function loadAll(): Promise<Map<string, KnobValue>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("feature_knob")
    .select("feature, key, value");
  if (error) throw new Error(`feature_knob read failed: ${error.message}`);
  const next = new Map<string, KnobValue>();
  for (const row of data ?? []) {
    next.set(addr(row.feature, row.key), row.value);
  }
  return next;
}

async function ensureLoaded(): Promise<Map<string, KnobValue>> {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  if (!inFlight) {
    inFlight = loadAll()
      .then((next) => {
        cache = next;
        cachedAt = Date.now();
        return next;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Drop the cached window (tests, and after an admin write in the same tab). */
export function invalidateFeatureKnobs(): void {
  cache = null;
  cachedAt = 0;
}

async function readKnob(feature: string, key: string): Promise<KnobValue> {
  const all = await ensureLoaded();
  const hit = all.get(addr(feature, key));
  if (hit === undefined) {
    throw new Error(
      `Missing feature knob "${feature}.${key}". Knobs have no code fallback by ` +
        `design: seed the row in a migration and apply it live.`,
    );
  }
  return hit;
}

export async function knobNumber(feature: string, key: string): Promise<number> {
  const v = await readKnob(feature, key);
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(
      `feature knob "${feature}.${key}" is not a number: ${String(v)}`,
    );
  }
  return n;
}

export async function knobInt(feature: string, key: string): Promise<number> {
  return Math.round(await knobNumber(feature, key));
}

export async function knobBool(feature: string, key: string): Promise<boolean> {
  const v = await readKnob(feature, key);
  return v === true || v === "true";
}

export async function knobString(feature: string, key: string): Promise<string> {
  const v = await readKnob(feature, key);
  return typeof v === "string" ? v : String(v);
}

/**
 * Read several integer knobs of one feature in a single awaited step. The whole
 * table is one cached fetch, so this is purely ergonomic: it keeps a caller from
 * writing six sequential awaits that read as six round-trips.
 */
export async function knobInts<K extends string>(
  feature: string,
  keys: readonly K[],
): Promise<Record<K, number>> {
  await ensureLoaded();
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = await knobInt(feature, k);
  return out;
}
