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

/** Where a sampled load keeps the per-route rate map (route template -> rate) it resolved. */
export const ROUTE_RATES_STORAGE_KEY = "matrx.perf.client_sample_rate_by_route";

export type RouteRates = Record<string, number>;

/** A route-rate map from whatever the knob returned: only `/…` keys with a rate in [0, 1]. Never throws. */
export function routeRatesOf(knob: unknown): RouteRates {
  let v: unknown = knob;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return {};
  const out: RouteRates = {};
  for (const [route, raw] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof raw === "string" ? Number(raw) : raw;
    if (route.startsWith("/") && typeof n === "number" && Number.isFinite(n)) out[route] = Math.min(1, Math.max(0, n));
  }
  return out;
}

export function readStoredRouteRates(storage: Pick<Storage, "getItem"> | null): RouteRates {
  try {
    const raw = storage?.getItem(ROUTE_RATES_STORAGE_KEY);
    return raw == null ? {} : routeRatesOf(raw);
  } catch {
    return {};
  }
}

export function writeStoredRouteRates(storage: Pick<Storage, "setItem"> | null, rates: RouteRates): void {
  try {
    storage?.setItem(ROUTE_RATES_STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // A cache of the knob; a blocked store only costs the next load the global rate.
  }
}

function templateMatches(template: string, pathname: string): boolean {
  const t = template.split("/");
  const p = pathname.split("/");
  for (let i = 0; i < t.length; i++) {
    const seg = t[i];
    if (seg.startsWith("[...") && seg.endsWith("]")) return p.length > i; // catch-all takes the rest
    if (i >= p.length) return false;
    if (seg.startsWith("[") && seg.endsWith("]")) {
      if (p[i] === "") return false;
      continue;
    }
    if (seg !== p[i]) return false;
  }
  return t.length === p.length;
}

/**
 * The rate of the route this pathname belongs to, else null. Templates are matched against the raw
 * pathname (no React params needed at load time); the most specific one wins (fewest wildcard
 * segments, then the longest), so `/data/new` beats `/data/[tableId]`.
 */
export function routeRateFor(pathname: string, rates: RouteRates): number | null {
  const path = ((pathname || "/").split(/[?#]/)[0] || "/").replace(/(.)\/+$/, "$1");
  let best: string | null = null;
  const wild = (t: string) => t.split("/").filter((s) => s.startsWith("[")).length;
  for (const template of Object.keys(rates)) {
    if (!templateMatches(template, path)) continue;
    if (best === null || wild(template) < wild(best) || (wild(template) === wild(best) && template.length > best.length)) best = template;
  }
  return best === null ? null : rates[best];
}

/** The rate this load is judged against: its route's own rate (quiet routes report every load), else the global one. */
export function effectiveRate(pathname: string, globalRate: number, rates: RouteRates): number {
  const own = routeRateFor(pathname, rates);
  return own === null ? globalRate : own;
}

/**
 * The whole decision of an UNSAMPLED load: one random draw against the stored rate of its route (else the
 * stored global rate, else the default). No observer, no settings read, no network — two local-storage
 * reads. A sampled load then resolves the real knobs and refreshes both stored values (a raised rate reaches
 * every device through its sampled loads).
 */
export function loadIsSampled(
  draw: number,
  storage: Pick<Storage, "getItem"> | null,
  pathname: string = "",
): boolean {
  const rate = readStoredRate(storage);
  if (!pathname) return isSampled(draw, rate);
  return isSampled(draw, effectiveRate(pathname, rate, readStoredRouteRates(storage)));
}

/** web-vitals navigation types that are NOT this page load's own numbers: soft navigations are another route's, a bfcache restore or a discarded-tab restore measures a different moment. */
export const DROPPED_NAVIGATION_TYPES: readonly string[] = ["soft-navigation", "back-forward-cache", "restore"];

/**
 * When this page first became hidden, in ms since its time origin: 0 = it loaded in the background
 * (or was activated hidden), Infinity = still visible. Same rule as the web-vitals library: a hidden
 * `visibility-state` performance entry at/after activation wins; else a document that is hidden now
 * (and is not merely prerendering) is assumed hidden since the start.
 */
export function readFirstHiddenTime(
  doc: Pick<Document, "visibilityState"> & { prerendering?: boolean },
  perf: Pick<Performance, "getEntriesByType"> | undefined,
  activationStart = 0,
): number {
  if (!doc.prerendering) {
    try {
      const hidden = perf?.getEntriesByType("visibility-state").find((e) => e.name === "hidden" && e.startTime >= activationStart);
      if (hidden) return hidden.startTime;
    } catch {
      // The entry type is not supported here; the visibility state below decides.
    }
  }
  return doc.visibilityState === "hidden" && !doc.prerendering ? 0 : Infinity;
}

export interface VitalContext {
  /** From `readFirstHiddenTime`, kept current by a visibilitychange listener. */
  firstHiddenTime?: number;
  /** Navigation timing `activationStart`: TTFB is measured from here for an activated prerender. */
  activationStart?: number;
}

/**
 * Whether a metric is this load's own, trustworthy number. A load that started hidden is dropped whole
 * (background tabs are throttled and report absurd times); TTFB is also dropped if the page was hidden
 * before the first byte arrived (the request was deferred, not slow); LCP/INP/CLS are already clipped by
 * web-vitals itself at the first hidden time.
 */
export function metricIsKept(
  metric: { name: string; value: number; navigationType?: string },
  ctx: VitalContext = {},
): boolean {
  if (metric.navigationType && DROPPED_NAVIGATION_TYPES.includes(metric.navigationType)) return false;
  const hidden = ctx.firstHiddenTime ?? Infinity;
  if (hidden <= 0) return false;
  if (metric.name === "TTFB" && (ctx.activationStart ?? 0) + metric.value >= hidden) return false;
  return true;
}

/**
 * Collects one value per metric for this page load. LCP / FCP / TTFB keep their
 * first value; INP and CLS keep growing until the page is hidden, so the latest
 * wins. Soft navigations, bfcache / discarded-tab restores, hidden-start loads
 * and TTFBs that outlasted the page being visible are not kept.
 */
export function addVital(
  batch: Map<VitalName, VitalSample>,
  metric: { name: string; value: number; rating?: string; navigationType?: string },
  route: string,
  ctx: VitalContext = {},
): void {
  if (!isVitalName(metric.name) || !Number.isFinite(metric.value) || metric.value < 0) return;
  if (!metricIsKept(metric, ctx)) return;
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
