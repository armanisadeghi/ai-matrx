"use client";

/**
 * Large surface-write stress harness — the shared diff card under a ~200 KB
 * before and after, through the REAL shell (`ToolCallVisualization` → the
 * registry → `withSurfaceWriteDiff`). Press Run: the call streams (the
 * `context_patch` live preview), then its surface-write receipt lands and the
 * body swaps to the final diff. The page records every main-thread long task
 * and the worst frame gap into `window.__surfaceWriteStress` so a headless
 * browser can read the numbers (freeze = a long task; flicker = the diff
 * element unmounting after it first appears).
 *
 * Use case: a clinic's 200 KB policy manual kept as the chat's working
 * document; the agent tightens one clause.
 *
 * Route: /administration/utilities/surface-write-stress
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { SURFACE_WRITE_STEP } from "@/features/tool-call-visualization/surface-write/readSurfaceWrite";

const SECTION = (n: number) =>
  `## Section ${n}: Patient intake policy\n\n` +
  `Staff confirm the insurance card (front and back) and a photo ID before the visit. ` +
  `Consent forms are signed in the lobby, scanned the same day, and filed under the patient's chart number ${1000 + n}.\n\n` +
  `- Blood pressure is taken seated after five minutes of rest.\n- Follow-ups are scheduled before the patient leaves.\n\n`;

function manual(): string {
  let text = "# Riverside Clinic policy manual\n\n";
  let n = 1;
  while (text.length < 200_000) text += SECTION(n++);
  return text;
}

const OLD = "Blood pressure is taken seated after five minutes of rest.";
const NEW = "Blood pressure is taken seated after five minutes of rest, on the left arm, and recorded twice.";

interface Stress {
  running: boolean;
  longTasks: number[];
  worstFrameGapMs: number;
  diffMountedAt: number | null;
  diffUnmountsAfterMount: number;
  swappedAt: number | null;
}

declare global {
  interface Window {
    __surfaceWriteStress?: Stress;
  }
}

export function SurfaceWriteStress() {
  const [entry, setEntry] = useState<ToolLifecycleEntry | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stress: Stress = {
      running: false,
      longTasks: [],
      worstFrameGapMs: 0,
      diffMountedAt: null,
      diffUnmountsAfterMount: 0,
      swappedAt: null,
    };
    window.__surfaceWriteStress = stress;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        if (!stress.running) return;
        for (const e of list.getEntries()) stress.longTasks.push(Math.round(e.duration));
      });
      observer.observe({ type: "longtask", buffered: false });
    } catch {
      // longtask is Chromium-only; the frame-gap sampler below still measures.
    }
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      if (stress.running) stress.worstFrameGapMs = Math.max(stress.worstFrameGapMs, Math.round(now - last));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const mo = new MutationObserver(() => {
      const present = !!hostRef.current?.querySelector("[data-surface-write-diff]");
      if (present && stress.diffMountedAt === null) stress.diffMountedAt = performance.now();
      if (!present && stress.diffMountedAt !== null) stress.diffUnmountsAfterMount += 1;
    });
    if (hostRef.current) mo.observe(hostRef.current, { childList: true, subtree: true });
    return () => {
      observer?.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const run = () => {
    const stress = window.__surfaceWriteStress;
    const before = manual();
    const after = before.replace(OLD, NEW);
    const callId = `stress_${Date.now()}`;
    const base: ToolLifecycleEntry = {
      callId,
      toolName: "context_patch",
      displayName: "context_patch",
      status: "started",
      arguments: { key: "clinic_manual", command: "str_replace", old_str: OLD, new_str: NEW },
      startedAt: new Date().toISOString(),
      completedAt: null,
      latestMessage: null,
      latestData: null,
      result: null,
      resultPreview: null,
      errorType: null,
      errorMessage: null,
      isDelegated: false,
      events: [],
    };
    if (stress) {
      stress.running = true;
      stress.longTasks = [];
      stress.worstFrameGapMs = 0;
      stress.diffMountedAt = null;
      stress.diffUnmountsAfterMount = 0;
      stress.swappedAt = null;
    }
    setEntry(base);
    // Streaming progress events while the write is in flight.
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      setEntry((e) =>
        e
          ? {
              ...e,
              status: "progress",
              latestMessage: `Applying edit (${ticks})`,
              events: [
                ...e.events,
                { event: "tool_progress", call_id: callId, tool_name: "context_patch", message: `tick ${ticks}` },
              ],
            }
          : e,
      );
      if (ticks === 10) {
        window.clearInterval(timer);
        if (stress) stress.swappedAt = performance.now();
        setEntry((e) =>
          e
            ? {
                ...e,
                status: "completed",
                completedAt: new Date().toISOString(),
                result: { key: "clinic_manual", command: "str_replace", new_size_chars: after.length },
                events: [
                  ...e.events,
                  {
                    event: "tool_step",
                    call_id: callId,
                    tool_name: "context_patch",
                    message: "Recorded the change",
                    data: {
                      step: SURFACE_WRITE_STEP,
                      metadata: {
                        target_type: "context",
                        target_id: null,
                        target_label: "Clinic policy manual",
                        mode: "patch",
                        content_format: "markdown",
                        before,
                        after,
                        before_chars: before.length,
                        after_chars: after.length,
                        truncated: false,
                        edits: 1,
                      },
                    },
                  },
                ],
              }
            : e,
        );
        window.setTimeout(() => {
          if (stress) stress.running = false;
        }, 4000);
      }
    }, 200);
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 overflow-auto px-2 py-4">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={run}>
          Run 200 KB write
        </Button>
        <span className="text-xs text-muted-foreground">
          Streams 2 s, then the receipt lands (≈200 KB before and after).
        </span>
      </div>
      <div ref={hostRef} data-stress-host="">
        {entry ? <ToolCallVisualization entries={[entry]} hasContent /> : null}
      </div>
    </div>
  );
}
