// lib/perf/vitals.ts
//
// Real-user page speed (performance-watch PLAN §2): the pure half of
// `PerfVitalsReporter`. A page load is sampled once (one random draw against
// the knob `perf.client_sample_rate`); a sampled load sends ONE batch of its
// web-vitals to the signed-in door `ops.perf_client_report` when the page is
// hidden. An unsampled load keeps nothing and sends nothing.

import { isUuidShape } from "@ai-matrx/kit/uuid";

export const VITAL_NAMES = ["LCP", "INP", "CLS", "TTFB", "FCP"] as const;
export type VitalName = (typeof VITAL_NAMES)[number];

/** The knob's platform default, used only until the knob has answered. */
export const DEFAULT_CLIENT_SAMPLE_RATE = 0.05;
/** The door refuses more than this many samples per page load. */
export const MAX_SAMPLES_PER_LOAD = 20;

export interface VitalSample {
  name: VitalName;
  value: number;
  route: string;
  rating?: string;
  navigationType?: string;
}

export function isVitalName(name: string): name is VitalName {
  return (VITAL_NAMES as readonly string[]).includes(name);
}

const LONG_NUMBER = /^[0-9]{3,}$/;

/**
 * The route TEMPLATE of a pathname — never a raw id. Every segment that is a
 * dynamic param value becomes `[param]` (catch-all values `[...param]`), and any
 * uuid / long number left over becomes `[id]` / `[n]`, so a route the params do
 * not describe still never carries an identifier.
 */
export function routeTemplate(
  pathname: string,
  params: Record<string, string | string[] | undefined> | null | undefined,
): string {
  const path = (pathname || "/").split(/[?#]/)[0] || "/";
  const segments = path.split("/");
  const byValue = new Map<string, string>();
  for (const [key, raw] of Object.entries(params ?? {})) {
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) byValue.set(decodeSafe(v), Array.isArray(raw) ? `[...${key}]` : `[${key}]`);
  }
  const out: string[] = [];
  for (const seg of segments) {
    const decoded = decodeSafe(seg);
    const named = byValue.get(decoded);
    if (named) {
      if (named.startsWith("[...") && out[out.length - 1] === named) continue;
      out.push(named);
    } else if (isUuidShape(decoded)) out.push("[id]");
    else if (LONG_NUMBER.test(decoded)) out.push("[n]");
    else out.push(seg);
  }
  const joined = out.join("/") || "/";
  return (joined.startsWith("/") ? joined : `/${joined}`).slice(0, 200);
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The knob as a usable rate: a number in [0, 1], else the platform default. */
export function sampleRateOf(knob: unknown): number {
  const n = typeof knob === "string" ? Number(knob) : knob;
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_CLIENT_SAMPLE_RATE;
  return Math.min(1, Math.max(0, n));
}

/** One draw per page load against the rate: 0 is off, 1 is every load. */
export function isSampled(draw: number, rate: number): boolean {
  return rate > 0 && draw < rate;
}

/** Where a sampled load keeps the rate it resolved, so the next load decides without any read. */
export const RATE_STORAGE_KEY = "matrx.perf.client_sample_rate";

export type RateStorage = Pick<Storage, "getItem" | "setItem">;

/** The last rate a sampled load resolved from the knob, else the platform default. Never throws. */
export function readStoredRate(storage: Pick<Storage, "getItem"> | null): number {
  try {
    const raw = storage?.getItem(RATE_STORAGE_KEY);
    return raw == null ? DEFAULT_CLIENT_SAMPLE_RATE : sampleRateOf(raw);
  } catch {
    return DEFAULT_CLIENT_SAMPLE_RATE;
  }
}

export function writeStoredRate(storage: Pick<Storage, "setItem"> | null, rate: number): void {
  try {
    storage?.setItem(RATE_STORAGE_KEY, String(rate));
  } catch {
    // Storage is a cache of the knob; a full or blocked store only costs the next load a default draw.
  }
}

/**
 * The whole decision of an UNSAMPLED load: one random draw against the stored (or default) rate.
 * No observer, no settings read, no network. A sampled load then resolves the real knob and
 * refreshes the stored rate (a raised rate reaches every device through its sampled loads).
 */
export function loadIsSampled(draw: number, storage: Pick<Storage, "getItem"> | null): boolean {
  return isSampled(draw, readStoredRate(storage));
}

/**
 * Collects one value per metric for this page load. LCP / FCP / TTFB keep their
 * first value; INP and CLS keep growing until the page is hidden, so the latest
 * wins. Soft navigations are another route's numbers and are not kept.
 */
export function addVital(
  batch: Map<VitalName, VitalSample>,
  metric: { name: string; value: number; rating?: string; navigationType?: string },
  route: string,
): void {
  if (!isVitalName(metric.name) || !Number.isFinite(metric.value) || metric.value < 0) return;
  if (metric.navigationType === "soft-navigation") return;
  if (batch.has(metric.name) && metric.name !== "INP" && metric.name !== "CLS") return;
  if (!batch.has(metric.name) && batch.size >= MAX_SAMPLES_PER_LOAD) return;
  batch.set(metric.name, {
    name: metric.name,
    value: Math.round(metric.value * 1000) / 1000,
    route,
    rating: metric.rating,
    navigationType: metric.navigationType,
  });
}
