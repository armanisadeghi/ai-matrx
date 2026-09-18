"use client";

// features/masterwork/capture-plan/useCapturePlanSettings.ts
//
// The eleven `masterwork.capture_plan` knobs, ladder-resolved for THIS person
// on THIS Rulebook: platform → organization → user → rulebook.
//
// 🚨 NO CODE FALLBACK — the same three states as `useInterviewSettings`, and
// for the same reason. Every one of these knobs decides something an Expert
// will feel (how long a session is, how often one arrives, where the reminder
// lands, when the plan gives up), so a screen that quietly picks one while the
// setting is unreadable is a screen that lies. It says so instead.
//
// These are the values the setup screen OPENS with. Once a plan exists, the
// plan carries its own copy — changing a knob afterwards never rewrites a
// running plan behind the Expert's back.

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import type { Cadence, PlanSettings, ReminderChannel, StopRule } from "./types";

export const KNOB_FEATURE = "masterwork.capture_plan";
export const KNOB_SESSION_MINUTES = `${KNOB_FEATURE}.session_minutes`;
export const KNOB_SESSIONS_PER_DAY = `${KNOB_FEATURE}.sessions_per_day`;
export const KNOB_CADENCE = `${KNOB_FEATURE}.cadence`;
export const KNOB_REMINDER_CHANNEL = `${KNOB_FEATURE}.reminder_channel`;
export const KNOB_REMINDER_LEAD = `${KNOB_FEATURE}.reminder_lead_minutes`;
export const KNOB_REMINDER_HORIZON = `${KNOB_FEATURE}.reminder_horizon_hours`;
export const KNOB_METHODS_ALLOWED = `${KNOB_FEATURE}.methods_allowed`;
export const KNOB_STOP_RULE = `${KNOB_FEATURE}.stop_rule`;
export const KNOB_FLATTEN_WINDOW = `${KNOB_FEATURE}.flatten_window`;
export const KNOB_HORIZON_DAYS = `${KNOB_FEATURE}.horizon_days`;
export const KNOB_TARGET_RULES = `${KNOB_FEATURE}.target_rules`;
export const KNOB_VOICE_DEFAULT_ON = `${KNOB_FEATURE}.voice_default_on`;

export type CapturePlanSettingsState =
  | { state: "loading" }
  | { state: "failed"; reason: string; retry: () => void }
  | {
      state: "ready";
      /** Everything except `minutesPerDay`, which only the Expert can answer. */
      defaults: Omit<PlanSettings, "minutesPerDay">;
      voiceDefaultOn: boolean;
    };

const CADENCES: Cadence[] = ["daily", "weekdays", "every_other_day", "weekly"];
const CHANNELS: ReminderChannel[] = ["preferences", "in_app", "email", "sms", "off"];
const STOP_RULES: StopRule[] = ["yield_flat", "coverage_met", "either", "horizon_only"];

function readInt(key: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} resolved to ${JSON.stringify(value)} — it must be a number.`);
  }
  return Math.round(value);
}

function readBool(key: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${key} resolved to ${JSON.stringify(value)} — it must be true or false.`);
  }
  return value;
}

function readOneOf<T extends string>(key: string, value: unknown, allowed: T[]): T {
  if (typeof value === "string" && (allowed as string[]).includes(value)) return value as T;
  throw new Error(
    `${key} resolved to ${JSON.stringify(value)} — it must be one of ${allowed.join(", ")}.`,
  );
}

/**
 * `methods_allowed` is either the literal `"all"` or a list of Approach keys.
 * An empty list is REFUSED rather than read as "all": a plan allowed to use
 * nothing is a real, meaningful state (the planner refuses by name), and
 * quietly turning it into "everything" would be the opposite of what whoever
 * set it meant.
 */
export function readMethodsAllowed(value: unknown): "all" | string[] {
  if (value === "all") return "all";
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value as string[];
  }
  throw new Error(
    `${KNOB_METHODS_ALLOWED} resolved to ${JSON.stringify(value)} — it must be "all" or a list of method names.`,
  );
}

export function useCapturePlanSettings(
  rulebookId: string | null | undefined,
  rulebookOrganizationId: string | null | undefined,
): CapturePlanSettingsState {
  // The Rulebook's OWN organization, never the active one — organization is
  // tenancy, and a setting answered for a Rulebook must resolve where that
  // Rulebook lives.
  const fallbackOrg = useAppSelector((s) => s.appContext?.organization_id ?? null);
  const organizationId = rulebookOrganizationId ?? fallbackOrg;
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const [epoch, setEpoch] = useState(0);
  const [settings, setSettings] = useState<CapturePlanSettingsState>({ state: "loading" });
  const retry = useCallback(() => setEpoch((n) => n + 1), []);

  useEffect(() => {
    if (!organizationId || !rulebookId) {
      setSettings({ state: "loading" });
      return undefined;
    }
    let live = true;
    setSettings({ state: "loading" });
    const scopes = [{ kind: "rulebook", id: rulebookId }];
    const read = (key: string) => ensureEffectiveKnob(organizationId, userId, key, scopes);
    void (async () => {
      try {
        const [
          sessionMinutes,
          sessionsPerDay,
          cadence,
          reminderChannel,
          reminderLead,
          reminderHorizon,
          methodsAllowed,
          stopRule,
          flattenWindow,
          horizonDays,
          targetRules,
          voice,
        ] = await Promise.all([
          read(KNOB_SESSION_MINUTES),
          read(KNOB_SESSIONS_PER_DAY),
          read(KNOB_CADENCE),
          read(KNOB_REMINDER_CHANNEL),
          read(KNOB_REMINDER_LEAD),
          read(KNOB_REMINDER_HORIZON),
          read(KNOB_METHODS_ALLOWED),
          read(KNOB_STOP_RULE),
          read(KNOB_FLATTEN_WINDOW),
          read(KNOB_HORIZON_DAYS),
          read(KNOB_TARGET_RULES),
          read(KNOB_VOICE_DEFAULT_ON),
        ]);
        if (!live) return;
        setSettings({
          state: "ready",
          voiceDefaultOn: readBool(KNOB_VOICE_DEFAULT_ON, voice),
          defaults: {
            sessionMinutes: readInt(KNOB_SESSION_MINUTES, sessionMinutes),
            sessionsPerDay: readInt(KNOB_SESSIONS_PER_DAY, sessionsPerDay),
            cadence: readOneOf(KNOB_CADENCE, cadence, CADENCES),
            reminderChannel: readOneOf(KNOB_REMINDER_CHANNEL, reminderChannel, CHANNELS),
            reminderLeadMinutes: readInt(KNOB_REMINDER_LEAD, reminderLead),
            reminderHorizonHours: readInt(KNOB_REMINDER_HORIZON, reminderHorizon),
            methodsAllowed: readMethodsAllowed(methodsAllowed),
            stopRule: readOneOf(KNOB_STOP_RULE, stopRule, STOP_RULES),
            flattenWindow: readInt(KNOB_FLATTEN_WINDOW, flattenWindow),
            horizonDays: readInt(KNOB_HORIZON_DAYS, horizonDays),
            targetRules: readInt(KNOB_TARGET_RULES, targetRules),
          },
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
