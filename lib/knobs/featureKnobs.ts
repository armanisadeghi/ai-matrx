// lib/knobs/featureKnobs.ts
//
// THE runtime reader for `platform.feature_knob` in this repo. The admin page
// (`features/admin/limits/`) could already WRITE knobs; nothing could read one
// at runtime, so every ceiling in the app stayed a constant and turning a knob
// changed nothing. This is the missing half.
//
// Contract (cross-repo SoR: common-docs/systems/platform/feature-knobs/FEATURE.md):
//   - A MISSING knob RAISES. There is deliberately no constant to fall back on:
//     a frozen fallback is exactly the silent failure the knob system exists to
//     end. Seed the row in a migration, then read it here.
//   - Reads are cached for 60s, TTL-only. An admin writes straight to Postgres
//     from the browser, so there is no invalidation channel to build (or forget
//     to fire) and the value is live within a minute, everywhere.
//   - One fetch per window, shared: concurrent callers await the same promise,
//     so a kit fan-out asking eight generators for their knobs costs ONE query.

import { readAllRows } from "@ai-matrx/data/db";

import { createClient } from "@/utils/supabase/client";

const TTL_MS = 60_000;

/**
 * Rows per request. Matches PostgREST's `db-max-rows` on Matrx Main, which is
 * the cap this read exists to page past.
 */
const DEFAULT_PAGE_SIZE = 1000;
let pageSize = DEFAULT_PAGE_SIZE;

/**
 * TEST SEAM. A fixture proving the catalogue is paged would otherwise need
 * 1001 rows; this lets it stand up three. Pass 0 to restore the real size.
 */
export function __setFeatureKnobPageSizeForTests(rows: number): void {
  pageSize = rows > 0 ? rows : DEFAULT_PAGE_SIZE;
}

type KnobValue = unknown;

let cache: Map<string, KnobValue> | null = null;
let cachedAt = 0;
let inFlight: Promise<Map<string, KnobValue>> | null = null;

function addr(feature: string, key: string): string {
  return `${feature} ${key}`;
}

async function loadAll(): Promise<Map<string, KnobValue>> {
  const supabase = createClient();
  // THE CATALOGUE IS A LIST WE TREAT AS COMPLETE. Every read here is an
  // existence check whose miss RAISES, and `platform.feature_knob` is already
  // ~870 rows against PostgREST's 1000-row cap. A bare `.select()` would not
  // error at the cap — it returns a successful-looking short array — so the
  // 1001st knob would make its readers report `Missing feature knob` for a row
  // sitting in the table. `(feature, key)` is the primary key, so ordering on
  // the pair is the stable total order paging requires.
  const rows = await readAllRows<{
    feature: string;
    key: string;
    value: KnobValue;
  }>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("feature_knob")
        .select("feature, key, value", { count: "exact" })
        // archived-items-law-exempt: this is the VALUE RESOLVER, not a list —
        // nothing is rendered from it, so there is no screen on which archived
        // rows could be revealed.
        // 🚨 AN ARCHIVED KNOB IS NOT A VALUE (THE ARCHIVED-ITEMS LAW, 2026-09-09).
        // This is the resolver every knob read goes through, so an archived row
        // left in here would keep deciding behaviour after somebody retired it —
        // silently, because nothing on screen would say the knob still exists.
        // A retired knob is absent, and its readers RAISE, which is the visible
        // failure the register is designed to produce.
        .is("archived_at", null)
        .order("feature", { ascending: true })
        .order("key", { ascending: true })
        .range(from, to),
    { label: "platform.feature_knob", pageSize },
  );
  const next = new Map<string, KnobValue>();
  for (const row of rows) {
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
 * Read a `value_type = 'json'` knob holding an ORDERED LIST OF STRINGS — the
 * shape an "which of these, and in what order" opinion takes (a curated tier, a
 * default column order, a preferred-provider ranking). Entries must be strings;
 * a non-string member raises rather than being coerced, because a silently
 * stringified `null` in such a list becomes a lookup that matches nothing.
 */
export async function knobStringList(
  feature: string,
  key: string,
): Promise<string[]> {
  const v = await readKnob(feature, key);
  if (!Array.isArray(v)) {
    throw new Error(
      `feature knob "${feature}.${key}" is not a JSON array: ${String(v)}`,
    );
  }
  return v.map((entry, i) => {
    if (typeof entry !== "string") {
      throw new Error(
        `feature knob "${feature}.${key}" entry ${i} is not a string: ${String(entry)}`,
      );
    }
    return entry;
  });
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
