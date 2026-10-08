"use client";

// Real-user page speed (performance-watch PLAN §2). Mounted once at the root
// layout; renders nothing. One random draw per page load against the knob
// `perf.client_sample_rate` (0 = off; a person may raise it for themselves):
// an unsampled load keeps nothing and sends nothing. A sampled, signed-in load
// sends ONE batch (route TEMPLATE, never a raw id) to `ops.perf_client_report`
// when the page is first hidden, with `keepalive` so the request outlives it.

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { supabase } from "@/utils/supabase/client";
import { getSessionKnob, resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { addVital, isSampled, routeTemplate, sampleRateOf, type VitalName, type VitalSample } from "./vitals";

const DRAW = typeof window === "undefined" ? 1 : Math.random();
const RATE_KNOB = "perf.client_sample_rate";
const batch = new Map<VitalName, VitalSample>();
let sent = false;
let accessToken: string | null = null;
let loadRoute: string | null = null;
let resolvedRate: number | null = null;

function rateNow(): number {
  if (resolvedRate !== null) return resolvedRate;
  const cached = getSessionKnob(RATE_KNOB);
  return sampleRateOf(cached);
}

function flush(): void {
  if (sent || batch.size === 0 || !accessToken) return;
  if (!isSampled(DRAW, rateNow())) return;
  sent = true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error("[perf-vitals] Supabase url or publishable key is missing; the sampled batch is dropped");
    return;
  }
  const release = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  const samples = [...batch.values()].map((s) => (release ? { ...s, release } : s));
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

// One stable callback (a new reference would replay every metric again).
function onMetric(metric: { name: string; value: number; rating?: string; navigationType?: string }): void {
  // A load already known to be unsampled keeps nothing.
  const known = resolvedRate ?? (getSessionKnob(RATE_KNOB) === undefined ? null : rateNow());
  if (known !== null && !isSampled(DRAW, known)) return;
  addVital(batch, metric, loadRoute ?? "/");
}

export function PerfVitalsReporter() {
  const pathname = usePathname();
  const params = useParams();
  // The route of THIS page load, set once (later soft navigations are not this load's numbers).
  useEffect(() => {
    if (loadRoute === null && pathname) {
      loadRoute = routeTemplate(pathname, params as Record<string, string | string[] | undefined> | null);
    }
  }, [pathname, params]);

  useReportWebVitals(onMetric);

  useEffect(() => {
    // Resolve the knob now so the decision is made by the time the page hides.
    void resolveSessionKnob(RATE_KNOB)
      .then((v) => {
        if (v !== undefined) resolvedRate = sampleRateOf(v);
      })
      .catch((error: unknown) => console.error("[perf-vitals] the sample rate could not be resolved", error));
    void supabase.auth.getSession().then(({ data }) => {
      accessToken = data.session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      accessToken = session?.access_token ?? null;
    });
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);

  return null;
}
