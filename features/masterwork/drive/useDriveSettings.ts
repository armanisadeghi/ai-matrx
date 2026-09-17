"use client";

// features/masterwork/drive/useDriveSettings.ts
//
// The five `masterwork.drive` knobs, ladder-resolved for THIS person on THIS
// Rulebook: platform → organization → user → rulebook (the `rulebook` rung was
// registered by aidream migration `0711_masterwork_interview_modes_are_knobs.sql`).
//
// 🚨 NO CODE FALLBACK — same contract as `record/useInterviewSettings.ts`, for
// the same reason (law 6: every behavioural choice is settings data with a
// default that lives in `platform.feature_knob`, never in a constant here).
// Three states, all of them honest: loading waits, failed SAYS so with the
// reason, ready carries the resolved values.
//
// `interviewer_mandate_key` is the one that matters most: it decides WHICH
// interviewer conducts a drive. The page never names an agent, and the owner
// can point the lane at a different interviewer — including one written for
// voice — by changing a setting, with no code change and no redeploy.

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

export const DRIVE_KNOB_FEATURE = "masterwork.drive";
export const KNOB_INTERVIEWER_MANDATE_KEY =
  "masterwork.drive.interviewer_mandate_key";
export const KNOB_RESUME_WINDOW_MINUTES =
  "masterwork.drive.resume_window_minutes";
export const KNOB_VOICE_COMMANDS = "masterwork.drive.voice_commands";
export const KNOB_AUTO_RECONNECT = "masterwork.drive.auto_reconnect";
export const KNOB_SPOKEN_STATUS = "masterwork.drive.spoken_status";

export interface DriveSettingsValues {
  /** Mandate key of the interviewer that conducts a drive. */
  interviewerMandateKey: string;
  /** How long a paused drive stays the SAME interview. */
  resumeWindowMinutes: number;
  /** Whether "pause" / "carry on" / "I'm done" are honoured as commands. */
  voiceCommands: boolean;
  /** Whether the page reconnects itself after signal loss. */
  autoReconnect: boolean;
  /** Whether connection changes are SAID out loud (nothing to read while moving). */
  spokenStatus: boolean;
}

export type DriveSettings =
  | { state: "loading" }
  | { state: "failed"; reason: string; retry: () => void }
  | ({ state: "ready" } & DriveSettingsValues);

export function useDriveSettings(
  rulebookId: string | null | undefined,
  rulebookOrganizationId: string | null | undefined,
): DriveSettings {
  // The Rulebook's OWN organization, never the active one — see the same note
  // in useInterviewSettings: organization is tenancy, never permission.
  const fallbackOrg = useAppSelector(
    (s) => s.appContext?.organization_id ?? null,
  );
  const organizationId = rulebookOrganizationId ?? fallbackOrg;
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const [epoch, setEpoch] = useState(0);
  const [settings, setSettings] = useState<DriveSettings>({ state: "loading" });
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
        const [mandateKey, window, commands, reconnect, spoken] =
          await Promise.all([
            ensureEffectiveKnob(
              organizationId,
              userId,
              KNOB_INTERVIEWER_MANDATE_KEY,
              scopes,
            ),
            ensureEffectiveKnob(
              organizationId,
              userId,
              KNOB_RESUME_WINDOW_MINUTES,
              scopes,
            ),
            ensureEffectiveKnob(
              organizationId,
              userId,
              KNOB_VOICE_COMMANDS,
              scopes,
            ),
            ensureEffectiveKnob(
              organizationId,
              userId,
              KNOB_AUTO_RECONNECT,
              scopes,
            ),
            ensureEffectiveKnob(
              organizationId,
              userId,
              KNOB_SPOKEN_STATUS,
              scopes,
            ),
          ]);
        if (!live) return;
        setSettings({
          state: "ready",
          interviewerMandateKey: readMandateKey(mandateKey),
          resumeWindowMinutes: readPositiveNumber(
            KNOB_RESUME_WINDOW_MINUTES,
            window,
          ),
          voiceCommands: readBool(KNOB_VOICE_COMMANDS, commands),
          autoReconnect: readBool(KNOB_AUTO_RECONNECT, reconnect),
          spokenStatus: readBool(KNOB_SPOKEN_STATUS, spoken),
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

export function readMandateKey(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `${KNOB_INTERVIEWER_MANDATE_KEY} resolved to ${JSON.stringify(value)} — ` +
        "it must name the mandate of the interviewer that conducts a drive.",
    );
  }
  return value.trim();
}

export function readPositiveNumber(key: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `${key} resolved to ${JSON.stringify(value)} — it must be a positive number of minutes.`,
    );
  }
  return value;
}

export function readBool(key: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(
      `${key} resolved to ${JSON.stringify(value)} — it must be true or false.`,
    );
  }
  return value;
}
