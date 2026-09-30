/**
 * mainThreadStallMonitor — a page that freezes is a defect, never silence.
 *
 * Every other capture in this folder needs something to THROW. A frozen page
 * throws nothing: the browser locks up, the person waits, and the only trace
 * was a downstream symptom such as `sync-idb-operation-timeout` (its timer
 * could not run, so it blamed IndexedDB). This monitor watches the main thread
 * itself through the Long Animation Frame API (Chromium; `longtask` elsewhere
 * gives duration without attribution) and captures one Inspector entry when
 * the page is blocked long enough for a person to feel it, naming the scripts
 * that held the thread so the culprit is in the evidence, not a guess.
 *
 * Thresholds: one frame blocked ≥ STALL_SINGLE_FRAME_MS, or ≥
 * STALL_WINDOW_BLOCKED_MS of blocking inside a STALL_WINDOW_MS window (a
 * stream of shorter freezes that together make the page unusable). One report
 * per STALL_REPORT_COOLDOWN_MS; repeats collapse into the same entry's count.
 */

import { captureError } from "./errorCaptureStore";

export const STALL_SINGLE_FRAME_MS = 2_000;
export const STALL_WINDOW_MS = 10_000;
export const STALL_WINDOW_BLOCKED_MS = 4_000;
export const STALL_REPORT_COOLDOWN_MS = 30_000;
/** Scripts named in one report. */
const MAX_CULPRITS = 5;

/** The subset of a PerformanceLongAnimationFrameTiming this monitor reads. */
export interface StallFrame {
  startTime: number;
  duration: number;
  /** LoAF `blockingDuration`; `longtask` entries fall back to `duration`. */
  blockingDuration?: number;
  scripts?: ReadonlyArray<{
    duration: number;
    invoker?: string;
    invokerType?: string;
    sourceURL?: string;
    sourceFunctionName?: string;
    forcedStyleAndLayoutDuration?: number;
  }>;
}

export interface StallReport {
  blockedMs: number;
  frames: number;
  longestFrameMs: number;
  /** Script time the browser could attribute; the rest is style/layout/paint or sub-5ms slices (React). */
  attributedMs: number;
  forcedLayoutMs: number;
  culprits: string[];
}

function blocking(frame: StallFrame): number {
  return frame.blockingDuration ?? frame.duration;
}

function scriptLabel(script: NonNullable<StallFrame["scripts"]>[number]): string {
  const file = (script.sourceURL ?? "").split("?")[0].split("/").pop() || "inline";
  const fn = script.sourceFunctionName || script.invoker || "(anonymous)";
  return `${fn} @ ${file}`;
}

/** Pure: collapse the frames of one stall into its report. Exported for tests. */
export function summarizeStall(frames: readonly StallFrame[]): StallReport {
  const byScript = new Map<string, number>();
  let blockedMs = 0;
  let longestFrameMs = 0;
  let attributedMs = 0;
  let forcedLayoutMs = 0;
  for (const frame of frames) {
    blockedMs += blocking(frame);
    longestFrameMs = Math.max(longestFrameMs, frame.duration);
    for (const script of frame.scripts ?? []) {
      attributedMs += script.duration;
      forcedLayoutMs += script.forcedStyleAndLayoutDuration ?? 0;
      const label = scriptLabel(script);
      byScript.set(label, (byScript.get(label) ?? 0) + script.duration);
    }
  }
  const culprits = [...byScript.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CULPRITS)
    .map(([label, ms]) => `${label} (${Math.round(ms)}ms)`);
  return {
    blockedMs: Math.round(blockedMs),
    frames: frames.length,
    longestFrameMs: Math.round(longestFrameMs),
    attributedMs: Math.round(attributedMs),
    forcedLayoutMs: Math.round(forcedLayoutMs),
    culprits,
  };
}

/**
 * Pure detector: feed frames in order; returns a report when the thresholds
 * are crossed (and the cooldown has passed), else null. Exported for tests.
 */
export function createStallDetector() {
  let window: StallFrame[] = [];
  let lastReportAt = Number.NEGATIVE_INFINITY;
  return (frame: StallFrame): StallReport | null => {
    const end = frame.startTime + frame.duration;
    window = window.filter((f) => f.startTime + f.duration > end - STALL_WINDOW_MS);
    window.push(frame);
    const windowBlocked = window.reduce((sum, f) => sum + blocking(f), 0);
    const tripped =
      blocking(frame) >= STALL_SINGLE_FRAME_MS || windowBlocked >= STALL_WINDOW_BLOCKED_MS;
    if (!tripped || end - lastReportAt < STALL_REPORT_COOLDOWN_MS) return null;
    lastReportAt = end;
    const report = summarizeStall(window);
    window = [];
    return report;
  };
}

let installed = false;

/** Browser-only, idempotent. Installed with the global error capture. */
export function installMainThreadStallMonitor(): void {
  if (installed || typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return;
  }
  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  const type = supported.includes("long-animation-frame")
    ? "long-animation-frame"
    : supported.includes("longtask")
      ? "longtask"
      : null;
  if (!type) return;
  // The dev server compiles routes on the main thread's clock (multi-second
  // frames on first visit) — that is tooling, not the product. Local
  // verification opts in with localStorage `matrx:stall-monitor` = "1".
  if (process.env.NODE_ENV === "development") {
    let optedIn = false;
    try {
      optedIn = window.localStorage.getItem("matrx:stall-monitor") === "1";
    } catch {
      /* storage blocked: stay off in development */
    }
    if (!optedIn) return;
  }
  installed = true;
  const detect = createStallDetector();
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // A frame that ran while the tab was hidden is the browser throttling
        // us, not the page freezing in front of a person.
        if (document.visibilityState === "hidden") continue;
        const report = detect(entry as unknown as StallFrame);
        if (!report) continue;
        try {
          captureError({
            source: "runtime-exception",
            code: "main-thread-stall",
            message: "[perf] The page froze: the main thread was blocked long enough for a person to feel it.",
            details:
              `blockedMs=${report.blockedMs}; frames=${report.frames}; longestFrameMs=${report.longestFrameMs}; ` +
              `attributedScriptMs=${report.attributedMs}; forcedLayoutMs=${report.forcedLayoutMs}; ` +
              `culprits=${report.culprits.join(" | ") || "none attributed (style/layout/paint or sub-5ms React slices)"}`,
            hint: "The culprits name the functions that held the thread. Unattributed time is rendering or many small tasks — profile the route in DevTools Performance.",
            raw: report,
          });
        } catch {
          /* capture must never break the page */
        }
      }
    }).observe({ type, buffered: false });
  } catch {
    installed = false;
  }
}
