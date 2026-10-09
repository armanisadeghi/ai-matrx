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
// the knob now says it should not have been sampled), collects LCP/INP/CLS/TTFB
// and sends ONE batch (route TEMPLATE, never a raw id) to
// `ops.perf_client_report` when the page is first hidden, with `keepalive`.

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { supabase } from "@/utils/supabase/client";
import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";
import {
  addVital,
  isSampled,
  loadIsSampled,
  routeTemplate,
  sampleRateOf,
  writeStoredRate,
  type VitalName,
  type VitalSample,
} from "./vitals";

const RATE_KNOB = "perf.client_sample_rate";

function deviceStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// The one draw of this page load, and the one decision it buys.
const DRAW = typeof window === "undefined" ? 1 : Math.random();
const SAMPLED = typeof window !== "undefined" && loadIsSampled(DRAW, deviceStorage());

const batch = new Map<VitalName, VitalSample>();
let sent = false;
let dropped = false;
let accessToken: string | null = null;
let loadRoute: string | null = null;

function flush(): void {
  if (sent || dropped || batch.size === 0 || !accessToken) return;
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
  if (dropped) return;
  addVital(batch, metric, loadRoute ?? "/");
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

  useReportWebVitals(onMetric);

  useEffect(() => {
    // Resolve the knob now: refresh the stored rate for the next load, and drop this one if the
    // knob has since been lowered below this load's draw.
    void resolveSessionKnob(RATE_KNOB)
      .then((v) => {
        if (v === undefined) return;
        const rate = sampleRateOf(v);
        writeStoredRate(deviceStorage(), rate);
        if (!isSampled(DRAW, rate)) {
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

export function PerfVitalsReporter() {
  return SAMPLED ? <SampledReporter /> : null;
}
