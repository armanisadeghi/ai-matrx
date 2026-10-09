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
//   - One fetch per FEATURE per window, shared: concurrent callers await the same
//     promise, so a kit fan-out asking eight generators for their knobs costs ONE
//     query — and never the whole catalogue.

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

/**
 * ONE FEATURE AT A TIME (2026-10-09, startup reads). Every knob read used to page the WHOLE
 * catalogue (~3,500 rows, four requests) — on every signed-in page load, because a single
 * startup read (the workspace wait, the spend popover) asked for one knob. A read now fetches only
 * its own feature's rows: one small request, cached per feature for the same 60 s window, shared by
 * concurrent callers of that feature. Still paged through `readAllRows` — a feature is a list we
 * treat as complete, and a miss RAISES.
 */
type FeatureWindow = { at: number; map: Map<string, KnobValue> };

const windows = new Map<string, FeatureWindow>();
const inFlight = new Map<string, Promise<Map<string, KnobValue>>>();

async function loadFeature(feature: string): Promise<Map<string, KnobValue>> {
  const supabase = createClient();
  // THE FEATURE'S ROWS ARE A LIST WE TREAT AS COMPLETE. Every read here is an
  // existence check whose miss RAISES. A bare `.select()` would not error at
  // PostgREST's cap — it returns a successful-looking short array — so the
  // knob past it would report `Missing feature knob` for a row sitting in the
  // table. `(feature, key)` is the primary key, so ordering on key within one
  // feature is the stable total order paging requires.
  const rows = await readAllRows<{
    key: string;
    value: KnobValue;
  }>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("feature_knob")
        .select("key, value", { count: "exact" })
        .eq("feature", feature)
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
        .order("key", { ascending: true })
        .range(from, to),
    { label: `platform.feature_knob[${feature}]`, pageSize },
  );
  const next = new Map<string, KnobValue>();
  for (const row of rows) next.set(row.key, row.value);
  return next;
}

/**
 * THE SAME 60 s WINDOW SURVIVES A RELOAD (lane PAGE-BUNDLE-2). Each feature's window is kept in
 * this tab's sessionStorage with the moment it was read, so the contract ("live within a minute,
 * everywhere") is unchanged: a stored window older than TTL_MS is never used.
 */
const STORED_PREFIX = "matrx.featureKnobs.v2:";

function readStoredWindow(feature: string): FeatureWindow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORED_PREFIX + feature);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { at?: unknown; rows?: unknown };
    if (typeof stored.at !== "number" || !Array.isArray(stored.rows)) return null;
    if (Date.now() - stored.at >= TTL_MS || stored.at > Date.now()) return null;
    return { at: stored.at, map: new Map(stored.rows as Array<[string, KnobValue]>) };
  } catch {
    return null;
  }
}

function storeWindow(feature: string, at: number, map: Map<string, KnobValue>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORED_PREFIX + feature, JSON.stringify({ at, rows: [...map.entries()] }));
  } catch {
    // A full or blocked sessionStorage only means the next reload reads this feature again.
  }
}

async function ensureFeature(feature: string): Promise<Map<string, KnobValue>> {
  const held = windows.get(feature);
  if (held && Date.now() - held.at < TTL_MS) return held.map;
  if (!held) {
    const stored = readStoredWindow(feature);
    if (stored) {
      windows.set(feature, stored);
      return stored.map;
    }
  }
  let pending = inFlight.get(feature);
  if (!pending) {
    pending = loadFeature(feature)
      .then((next) => {
        const at = Date.now();
        windows.set(feature, { at, map: next });
        storeWindow(feature, at, next);
        return next;
      })
      .finally(() => {
        inFlight.delete(feature);
      });
    inFlight.set(feature, pending);
  }
  return pending;
}

/** Drop every cached window (tests, and after an admin write in the same tab). */
export function invalidateFeatureKnobs(): void {
  windows.clear();
  if (typeof window !== "undefined") {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(STORED_PREFIX)) doomed.push(k);
      }
      for (const k of doomed) window.sessionStorage.removeItem(k);
    } catch {
      // nothing stored to forget
    }
  }
}

async function readKnob(feature: string, key: string): Promise<KnobValue> {
  const all = await ensureFeature(feature);
  const hit = all.get(key);
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
 * feature is one cached fetch, so this is purely ergonomic: it keeps a caller from
 * writing six sequential awaits that read as six round-trips.
 */
export async function knobInts<K extends string>(
  feature: string,
  keys: readonly K[],
): Promise<Record<K, number>> {
  await ensureFeature(feature);
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = await knobInt(feature, k);
  return out;
}
