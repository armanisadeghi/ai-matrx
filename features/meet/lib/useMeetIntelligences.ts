"use client";

// features/meet/lib/useMeetIntelligences.ts
//
// IDENTITY INJECTION for `@ai-matrx/meet`'s four in-meeting capabilities — and
// nothing else (C22). The package owns every behaviour: the assistant panel,
// what rides `variables`, the transcript cap, the note-taker dispatch. This
// hook answers one host question: WHO fulfils each job.
//
// 🚨 NO FALLBACK. A mandate that will not resolve leaves its capability OUT of
// the map, and `createMeetAi` then reports that capability `unavailable` while
// `<ControlBar>`'s `AiControl` renders nothing. Absent, never disabled-looking.
//
// The keys are OPTIONAL to `useMandateSet` on purpose: no `meet.*`
// `mandate.definition` row exists yet (MRI-A5 owns declaring them), so a
// refusal here is a known platform-configuration fact, not a system error worth
// filing four times per meeting.

import { useMemo } from "react";
import type { MeetAgents } from "@ai-matrx/meet";
import { useMandateSet } from "@/features/mandates/useMandateSet";
import {
  MEET_MANDATE_KEYS,
  MEET_MANDATE_KEY_LIST,
  type MeetCapability,
} from "./meetMandates";

export interface MeetIntelligences {
  /** Only the capabilities whose mandate resolved. Never a partial identity. */
  agents: MeetAgents;
  /** Which keys refused, and why. For diagnostics — not for the meeting screen. */
  unresolved: readonly { mandateKey: string; reason: string }[];
}

export function useMeetIntelligences(options: {
  /**
   * 🚨 ONLY WHILE A MEETING SURFACE IS ACTUALLY MOUNTED.
   *
   * `<MeetHost>` is app-wide (a call must ring on every surface), and resolving
   * four mandates on every route in the app is the exact defect
   * `<MessagingHost>` was repaired for on 2026-09-08 — four requests and four
   * refusals per page load for a panel nobody opened. While false this asks
   * nothing and returns an empty map.
   */
  enabled: boolean;
}): MeetIntelligences {
  const mandates = useMandateSet(MEET_MANDATE_KEY_LIST, {
    enabled: options.enabled,
    optionalKeys: MEET_MANDATE_KEY_LIST,
  });

  return useMemo(() => {
    const agents: { -readonly [K in MeetCapability]?: string } = {};
    const unresolved: { mandateKey: string; reason: string }[] = [];

    (Object.keys(MEET_MANDATE_KEYS) as MeetCapability[]).forEach(
      (capability) => {
        const mandateKey = MEET_MANDATE_KEYS[capability];
        const state = mandates[mandateKey];
        if (state === undefined || state.loading) return;
        if (state.mandate === null) {
          unresolved.push({
            mandateKey,
            reason:
              state.error ??
              "No Holder is bound to this job yet — bind one at /mandates.",
          });
          return;
        }
        agents[capability] = state.mandate.agentId;
      },
    );

    return { agents, unresolved };
  }, [mandates]);
}
