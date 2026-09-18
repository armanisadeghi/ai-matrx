"use client";

// features/masterwork/record/useInterviewSettings.ts
//
// The four `masterwork.interview` knobs, ladder-resolved for THIS person on
// THIS Rulebook: platform → organization → user → rulebook (the `rulebook` rung
// is registered by aidream migration
// `0711_masterwork_interview_modes_are_knobs.sql`).
//
// 🚨 NO CODE FALLBACK. Every default lives in `platform.feature_knob` — that is
// what makes these settings and not taste (law 6). So the hook has exactly three
// states and the start screen honours all three:
//   loading — nothing decided yet; the screen waits, it does not guess
//   ready   — the resolved values
//   failed  — the read failed; the screen SAYS so with the reason, because a
//             screen that quietly picks an interviewer while the setting is
//             unreadable is a screen that lies (law 4).
//
// Pattern copied deliberately from `features/question-desk/hooks/useQuestionDeskKnobs.ts`
// — same three states, same "drive ensureEffectiveKnob yourself" reason: here a
// knob decides WHICH interviewer the Expert gets, and getting that silently
// wrong is the failure this whole change exists to prevent.

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  isInterviewProbe,
  type InterviewContextModeSetting,
  type InterviewProbe,
} from "./interviewModes";

export const KNOB_CONTEXT_MODE = "masterwork.interview.context_mode";
export const KNOB_PROBE = "masterwork.interview.probe";
export const KNOB_CLOSING_SURPRISES = "masterwork.interview.closing_surprises";
export const KNOB_VOICE_DEFAULT_ON = "masterwork.interview.voice_default_on";

export interface InterviewSettingsValues {
  contextMode: InterviewContextModeSetting;
  probes: InterviewProbe[];
  closingSurprises: boolean;
  voiceDefaultOn: boolean;
}

export type InterviewSettings =
  | { state: "loading" }
  | { state: "failed"; reason: string; retry: () => void }
  | ({ state: "ready" } & InterviewSettingsValues);

export function useInterviewSettings(
  rulebookId: string | null | undefined,
  rulebookOrganizationId: string | null | undefined,
): InterviewSettings {
  // The Rulebook's OWN organization, not the active one — a setting answered
  // for a Rulebook must resolve in the tenancy that Rulebook lives in, or the
  // same Rulebook reads differently depending on which org the Expert last
  // clicked (organization is tenancy, never permission).
  const fallbackOrg = useAppSelector((s) => s.appContext?.organization_id ?? null);
  const organizationId = rulebookOrganizationId ?? fallbackOrg;
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const [epoch, setEpoch] = useState(0);
  const [settings, setSettings] = useState<InterviewSettings>({ state: "loading" });
  const retry = useCallback(() => setEpoch((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId || !rulebookId) {
      setSettings({ state: "loading" });
      return undefined;
    }
    let live = true;
    setSettings({ state: "loading" });
    const scopes = [{ kind: "rulebook", id: rulebookId }];
    void (async () => {
      try {
        const [mode, probe, closing, voice] = await Promise.all([
          ensureEffectiveKnob(organizationId, userId, KNOB_CONTEXT_MODE, scopes),
          ensureEffectiveKnob(organizationId, userId, KNOB_PROBE, scopes),
          ensureEffectiveKnob(organizationId, userId, KNOB_CLOSING_SURPRISES, scopes),
          ensureEffectiveKnob(organizationId, userId, KNOB_VOICE_DEFAULT_ON, scopes),
        ]);
        if (!live) return;
        setSettings({
          state: "ready",
          contextMode: readContextMode(mode),
          probes: readProbes(probe),
          closingSurprises: readBool(KNOB_CLOSING_SURPRISES, closing),
          voiceDefaultOn: readBool(KNOB_VOICE_DEFAULT_ON, voice),
        });
      } catch (error) {
        if (!live) return;
        setSettings({
          state: "failed",
          reason: error instanceof Error ? error.message : String(error),
          retry,
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [organizationId, userId, rulebookId, epoch, retry]);

  return settings;
}

export function readContextMode(value: unknown): InterviewContextModeSetting {
  if (value === "auto" || value === "primed" || value === "blank_slate") return value;
  throw new Error(
    `${KNOB_CONTEXT_MODE} resolved to ${JSON.stringify(value)} — it must be auto, primed or blank_slate.`,
  );
}

export function readProbes(value: unknown): InterviewProbe[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${KNOB_PROBE} resolved to ${JSON.stringify(value)} — it must be a list of probe names.`,
    );
  }
  const probes = value.filter(isInterviewProbe);
  if (probes.length !== value.length) {
    const unknown = value.filter((probe) => !isInterviewProbe(probe));
    throw new Error(
      `${KNOB_PROBE} names ways of digging this screen does not have: ${unknown.join(", ")}.`,
    );
  }
  if (probes.length === 0) {
    throw new Error(
      `${KNOB_PROBE} resolved to an empty list — an interview with no way of digging is not a setting, it is a broken one.`,
    );
  }
  return probes;
}

function readBool(key: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${key} resolved to ${JSON.stringify(value)} — it must be true or false.`);
  }
  return value;
}
