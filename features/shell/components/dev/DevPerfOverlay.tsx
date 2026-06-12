"use client";

/**
 * Dev-only performance overlay for the (ssr) shell.
 * Shows Web Vitals, hydration timing, and navigation metrics in a draggable panel.
 * Only renders in development — completely tree-shaken in production.
 *
 * Toggle panel: Ctrl/⌘+Shift+P (or click the ⏱ button in the bottom-right)
 * Hide/show everything: Ctrl/⌘+Shift+H
 */

import { EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Metric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
}

type MetricMap = Record<string, Metric>;

const RATING_COLORS = {
  good: "#22c55e",
  "needs-improvement": "#eab308",
  poor: "#ef4444",
} as const;

const THRESHOLDS: Record<string, [number, number]> = {
  FCP: [1800, 3000],
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
};

function rate(name: string, value: number): Metric["rating"] {
  const t = THRESHOLDS[name];
  if (!t)
    return value < 100 ? "good" : value < 500 ? "needs-improvement" : "poor";
  return value <= t[0] ? "good" : value <= t[1] ? "needs-improvement" : "poor";
}

function formatValue(name: string, value: number): string {
  if (name === "CLS") return value.toFixed(3);
  return `${Math.round(value)}ms`;
}

export default function DevPerfOverlay() {
  if (process.env.NODE_ENV !== "development") return null;

  return <DevPerfOverlayInner />;
}

function DevPerfOverlayInner() {
  const [hidden, setHidden] = useState(false);
  const [visible, setVisible] = useState(false);
  const [metrics, setMetrics] = useState<MetricMap>({});
  const [hydrationMs, setHydrationMs] = useState<number | null>(null);
  const [navEntries, setNavEntries] = useState<PerformanceNavigationTiming[]>(
    [],
  );
  const [isMac, setIsMac] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMac(
      navigator.platform.toUpperCase().includes("MAC") ||
        navigator.userAgent.includes("Mac"),
    );
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key === "H") {
        e.preventDefault();
        setHidden((h) => !h);
      } else if (mod && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const hydrationStart = performance.now();

    const cb = () => setHydrationMs(performance.now() - hydrationStart);
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(cb);
    } else {
      setTimeout(cb, 0);
    }

    const navEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navEntry) setNavEntries([navEntry]);

    let webVitalsLoaded = false;

    import("web-vitals")
      .then(({ onFCP, onLCP, onINP, onCLS, onTTFB }) => {
        webVitalsLoaded = true;
        const report = ({ name, value }: { name: string; value: number }) => {
          setMetrics((prev) => ({
            ...prev,
            [name]: { name, value, rating: rate(name, value) },
          }));
        };
        onFCP(report);
        onLCP(report);
        onINP(report);
        onCLS(report);
        onTTFB(report);
      })
      .catch(() => {
        if (!webVitalsLoaded) {
          console.warn(
            "[DevPerfOverlay] web-vitals not installed. Run: pnpm add web-vitals",
          );
        }
      });
  }, []);

  const nav = navEntries[0];

  if (hidden) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed",
          bottom: 12,
          right: 12,
          zIndex: 99999,
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: visible ? "#3b82f6" : "rgba(0,0,0,0.6)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(8px)",
          transition: "background 150ms",
        }}
        title={`Toggle performance overlay (${isMac ? "⌘" : "Ctrl"}+Shift+P)`}
      >
        {"⏱"}
      </button>

      {/* Panel */}
      {visible && (
        <div
          ref={containerRef}
          style={{
            position: "fixed",
            bottom: 56,
            right: 12,
            zIndex: 99998,
            width: 320,
            maxHeight: "70dvh",
            overflow: "auto",
            background: "rgba(0,0,0,0.88)",
            backdropFilter: "blur(12px)",
            color: "#e5e5e5",
            borderRadius: 10,
            padding: "12px 14px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            lineHeight: 1.5,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
            SSR PERFORMANCE — Dev Only
          </div>

          {/* Web Vitals */}
          <Section title="Web Vitals">
            {Object.keys(THRESHOLDS).map((name) => {
              const m = metrics[name];
              return (
                <Row
                  key={name}
                  label={name}
                  value={m ? formatValue(name, m.value) : "—"}
                  color={m ? RATING_COLORS[m.rating] : "#555"}
                />
              );
            })}
          </Section>

          {/* Hydration */}
          <Section title="Hydration">
            <Row
              label="Hydration"
              value={hydrationMs != null ? `${Math.round(hydrationMs)}ms` : "—"}
              color={
                hydrationMs != null && hydrationMs < 50 ? "#22c55e" : "#eab308"
              }
            />
          </Section>

          {/* Navigation Timing */}
          {nav && (
            <Section title="Navigation Timing">
              <Row
                label="DNS"
                value={`${Math.round(nav.domainLookupEnd - nav.domainLookupStart)}ms`}
              />
              <Row
                label="TCP"
                value={`${Math.round(nav.connectEnd - nav.connectStart)}ms`}
              />
              <Row
                label="TTFB"
                value={`${Math.round(nav.responseStart - nav.requestStart)}ms`}
                color={
                  nav.responseStart - nav.requestStart < 200
                    ? "#22c55e"
                    : "#eab308"
                }
              />
              <Row
                label="Download"
                value={`${Math.round(nav.responseEnd - nav.responseStart)}ms`}
              />
              <Row
                label="DOM Parse"
                value={`${Math.round(nav.domInteractive - nav.responseEnd)}ms`}
              />
              <Row
                label="DOM Ready"
                value={`${Math.round(nav.domContentLoadedEventEnd - nav.fetchStart)}ms`}
              />
              <Row
                label="Load"
                value={`${Math.round(nav.loadEventEnd - nav.fetchStart)}ms`}
              />
            </Section>
          )}

          <div
            style={{
              fontSize: 10,
              color: "#fff",
              marginTop: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              flexWrap: "wrap",
              textAlign: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setHidden(true)}
              title={`Hide overlay (${isMac ? "⌘" : "Ctrl"}+Shift+H)`}
              aria-label="Hide performance overlay"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                padding: 2,
                margin: 0,
                border: "none",
                background: "transparent",
                color: "#888",
                cursor: "pointer",
                borderRadius: 4,
              }}
            >
              <EyeOff size={14} strokeWidth={2} aria-hidden />
            </button>
            <span>
              {isMac ? " ⌘ Cmd" : "Ctrl"} Shift P to toggle &middot;{" "}
              {isMac ? "⌘ Cmd" : "Ctrl"} Shift H to hide &middot; Check terminal
              for server timings
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 10,
          color: "#3b82f6",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  color = "#e5e5e5",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "1px 0",
      }}
    >
      <span style={{ color: "#999" }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
