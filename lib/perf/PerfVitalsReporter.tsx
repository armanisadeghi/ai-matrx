"use client";

// Real-user page speed (performance-watch PLAN §2). Mounted once at the root
// layout; renders nothing. One random draw per page load against the rate the
// device last resolved from `perf.client_sample_rate` (stored locally; the
// platform default until a sampled load has resolved it; 0 = off).
//
// An UNSAMPLED load does exactly that draw and nothing else: no observers, no
// settings read, no auth call, no listener — `PerfVitalsReporter` has no hooks
// and returns null. Only a sampled load mounts `SampledReporter`, which
// resolves the real knob (refreshing the stored rate, and dropping the load if
// the knob now says it should not have been sampled), lazy-loads the `web-vitals`
// library after idle, collects LCP/INP/CLS/TTFB/FCP as each finalizes and sends them (route
// TEMPLATE, never a raw id) to `ops.perf_client_report` when the page becomes hidden, with `keepalive`.
//
// Order matters: on a page leaving, `pagehide` fires BEFORE `visibilitychange`→hidden, and web-vitals
// finalizes LCP / INP / CLS on that visibilitychange. Flushing on `pagehide` therefore shipped only the
// early metrics (TTFB, FCP) and lost every LCP and INP. The flush now waits for visibilitychange→hidden,
// whose web-vitals listeners (window, capture) have already run.

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { supabase } from "@/utils/supabase/client";
import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";
import {
  addVital,
  effectiveRate,
  readFirstHiddenTime,
  isSampled,
  loadIsSampled,
  routeRatesOf,
  routeTemplate,
  sampleRateOf,
  writeStoredRate,
  writeStoredRouteRates,
  type RouteRates,
  type VitalContext,
  type VitalName,
  type VitalSample,
} from "./vitals";

const RATE_KNOB = "perf.client_sample_rate";
const ROUTE_RATES_KNOB = "perf.client_sample_rate_by_route";

function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// The one draw of this page load, and the one decision it buys.
const DRAW = typeof window === "undefined" ? 1 : Math.random();
const SAMPLED = typeof window !== "undefined" && loadIsSampled(DRAW, deviceStorage(), window.location.pathname);

const batch = new Map<VitalName, VitalSample>();
const sentNames = new Set<VitalName>();
const vitalContext: VitalContext = { firstHiddenTime: Infinity, activationStart: 0 };
let dropped = false;
let started = false;
let accessToken: string | null = null;
let loadRoute: string | null = null;

/** Sends the metrics finalized since the last flush (each metric name goes out once per load). */
function flush(): void {
  if (dropped || !accessToken) return;
  const fresh = [...batch.values()].filter((s) => !sentNames.has(s.name));
  if (fresh.length === 0) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  for (const s of fresh) sentNames.add(s.name);
  if (!url || !key) {
    console.error("[perf-vitals] Supabase url or publishable key is missing; the sampled batch is dropped");
    return;
  }
  const release = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  const samples = fresh.map((s) => (release ? { ...s, release } : s));
  void fetch(`${url}/rest/v1/rpc/perf_client_report`, {
    method: "POST",
    keepalive: true,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Profile": "ops",
    },
    body: JSON.stringify({ p_samples: samples }),
  }).catch((error: unknown) => {
    console.error("[perf-vitals] the page-speed batch was not delivered", error);
  });
}

// One stable callback per metric (web-vitals calls it as each metric finalizes).
function onMetric(metric: { name: string; value: number; rating?: string; navigationType?: string }): void {
  if (dropped) return;
  addVital(batch, metric, loadRoute ?? "/", vitalContext);
}

function activationStartOf(): number {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as (PerformanceNavigationTiming & { activationStart?: number }) | undefined;
    return nav?.activationStart ?? 0;
  } catch {
    return 0;
  }
}

/** Loads web-vitals once, after idle (never on the critical path), and subscribes to the five metrics. */
function startCollecting(): void {
  if (started || dropped) return;
  started = true;
  const idle: (cb: () => void) => void =
    typeof window.requestIdleCallback === "function" ? (cb) => window.requestIdleCallback(cb, { timeout: 2000 }) : (cb) => void setTimeout(cb, 1);
  idle(() => {
    if (dropped) return;
    void import("web-vitals")
      .then(({ onTTFB, onFCP, onLCP, onINP, onCLS }) => {
        onTTFB(onMetric);
        onFCP(onMetric);
        onLCP(onMetric);
        onINP(onMetric);
        onCLS(onMetric);
      })
      .catch((error: unknown) => console.error("[perf-vitals] web-vitals could not be loaded", error));
  });
}

function SampledReporter() {
  const pathname = usePathname();
  const params = useParams();
  // The route of THIS page load, set once (later soft navigations are not this load's numbers).
  useEffect(() => {
    if (loadRoute === null && pathname) {
      loadRoute = routeTemplate(pathname, params as Record<string, string | string[] | undefined> | null);
    }
  }, [pathname, params]);

  useEffect(() => {
    // A load that started in a background tab (or was activated hidden) is throttled: its times are
    // not the user's. Drop it whole and collect nothing.
    vitalContext.activationStart = activationStartOf();
    vitalContext.firstHiddenTime = readFirstHiddenTime(document, performance, vitalContext.activationStart);
    if (vitalContext.firstHiddenTime <= 0) dropped = true;
    else startCollecting();
    // Resolve the knob now: refresh the stored rate for the next load, and drop this one if the
    // knob has since been lowered below this load's draw.
    void Promise.all([resolveSessionKnob(RATE_KNOB), resolveSessionKnob(ROUTE_RATES_KNOB)])
      .then(([globalKnob, routeKnob]) => {
        if (globalKnob === undefined) return;
        const rate = sampleRateOf(globalKnob);
        const routeRates: RouteRates = routeRatesOf(routeKnob);
        writeStoredRate(deviceStorage(), rate);
        if (routeKnob !== undefined) writeStoredRouteRates(deviceStorage(), routeRates);
        if (!isSampled(DRAW, effectiveRate(window.location.pathname, rate, routeRates))) {
          dropped = true;
          batch.clear();
        }
      })
      .catch((error: unknown) => console.error("[perf-vitals] the sample rate could not be resolved", error));
    void supabase.auth.getSession().then(({ data }) => {
      accessToken = data.session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      accessToken = session?.access_token ?? null;
    });
    // Bubble phase on document: runs after web-vitals' window-capture listeners finalized LCP / INP / CLS.
    const onHidden = (event: Event) => {
      if (document.visibilityState !== "hidden") return;
      if (!Number.isFinite(vitalContext.firstHiddenTime)) vitalContext.firstHiddenTime = event.timeStamp;
      flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  return null;
}

export function PerfVitalsReporter() {
  return SAMPLED ? <SampledReporter /> : null;
}
