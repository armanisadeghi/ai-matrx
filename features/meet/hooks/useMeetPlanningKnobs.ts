"use client";

// features/meet/hooks/useMeetPlanningKnobs.ts
//
// THE PERSON'S PLANNING SETTINGS (Meet wave 4) — `platform.feature_knob` rows
// under `meet`, platform → organization → person, resolved by
// `platform.knob_resolve`. Defaults are set for everyone in the admin
// dashboard; an organization or a person overrides them:
//
//   show_external_calendar_events  synced calendar events in Upcoming (on)
//   working_hours_start / _end     Find a time's working day (09:00–17:00)
//   working_days                   Find a time's days ("1,2,3,4,5")
//   find_time_step_minutes         the grid slots fall on (30)
//   find_time_suggestions          how many slots to offer (5)
//   find_time_horizon_days         how far ahead to look (14)
//
// A missing value reads as the platform default and never blocks a screen.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  knobRefusalSentence,
  setKnobOverride,
} from "@/lib/scoped-config/service";
import {
  DEFAULT_WORKING_HOURS,
  parseClock,
  parseWorkingDays,
  type WorkingHours,
} from "@/features/meet/lib/find-time";

export interface MeetPlanningKnobs {
  readonly loaded: boolean;
  readonly failure: string | null;
  readonly showExternalEvents: boolean;
  readonly hours: WorkingHours;
  readonly stepMinutes: number;
  readonly suggestions: number;
  readonly horizonDays: number;
}

export interface MeetPlanningKnobsResult extends MeetPlanningKnobs {
  readonly retry: () => void;
  setShowExternalEvents: (
    show: boolean,
    targetOrganizationId?: string,
  ) => Promise<void>;
}

export const PLANNING_DEFAULTS: MeetPlanningKnobs = {
  loaded: false,
  failure: null,
  showExternalEvents: true,
  hours: DEFAULT_WORKING_HOURS,
  stepMinutes: 30,
  suggestions: 5,
  horizonDays: 14,
};

const KEYS = [
  "show_external_calendar_events",
  "working_hours_start",
  "working_hours_end",
  "working_days",
  "find_time_step_minutes",
  "find_time_suggestions",
  "find_time_horizon_days",
] as const;

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function scopeKey(organizationId: string | null, userId: string | null) {
  return userId === null ? null : `${userId}:${organizationId ?? "none"}`;
}

export function useMeetPlanningKnobs(
  organizationId: string | null,
  userId: string | null,
): MeetPlanningKnobsResult {
  const [states, setStates] = useState<Record<string, MeetPlanningKnobs>>({});
  const [nonce, setNonce] = useState(0);
  const writeGenerations = useRef(new Map<string, number>());
  const pendingWrites = useRef(new Map<string, number>());
  const currentScope = scopeKey(organizationId, userId);
  const state =
    currentScope === null
      ? PLANNING_DEFAULTS
      : (states[currentScope] ?? PLANNING_DEFAULTS);

  useEffect(() => {
    if (userId === null || currentScope === null) return undefined;
    let live = true;
    const readGeneration = writeGenerations.current.get(currentScope) ?? 0;
    const read = (key: string) =>
      supabase.schema("platform").rpc("knob_resolve", {
        p_feature: "meet",
        p_key: key,
        p_organization_id: organizationId as string,
        p_user_id: userId,
      });
    void Promise.all(KEYS.map(read)).then(
      ([show, start, end, days, step, count, horizon]) => {
        if (
          !live ||
          (pendingWrites.current.get(currentScope) ?? 0) > 0 ||
          readGeneration !== (writeGenerations.current.get(currentScope) ?? 0)
        )
          return;
        const failure = [show, start, end, days, step, count, horizon].find(
          (result) => result.error,
        )?.error;
        if (failure) {
          setStates((previous) => ({
            ...previous,
            [currentScope]: {
              ...PLANNING_DEFAULTS,
              failure:
                failure.message || "Your calendar settings could not be read.",
              showExternalEvents: false,
            },
          }));
          return;
        }
        setStates((previous) => ({
          ...previous,
          [currentScope]: {
            loaded: true,
            failure: null,
            showExternalEvents:
              typeof show.data === "boolean" ? show.data : true,
            hours: {
              start: parseClock(start.data, DEFAULT_WORKING_HOURS.start),
              end: parseClock(end.data, DEFAULT_WORKING_HOURS.end),
              days: parseWorkingDays(days.data),
            },
            stepMinutes: positive(step.data, PLANNING_DEFAULTS.stepMinutes),
            suggestions: positive(count.data, PLANNING_DEFAULTS.suggestions),
            horizonDays: positive(horizon.data, PLANNING_DEFAULTS.horizonDays),
          },
        }));
      },
    );
    return () => {
      live = false;
    };
  }, [currentScope, nonce, organizationId, userId]);

  return {
    ...(userId === null ? PLANNING_DEFAULTS : state),
    retry: () => setNonce((value) => value + 1),
    /**
     * The person's own answer (user rung, inside the active organization). The
     * screen changes at once; a refusal is thrown as the door's own sentence.
     */
    async setShowExternalEvents(show: boolean, targetOrganizationId?: string) {
      const resolvedOrganizationId = targetOrganizationId ?? organizationId;
      if (resolvedOrganizationId === null || userId === null) {
        throw new Error("Choose an organization to save this setting.");
      }
      const targetScope = scopeKey(resolvedOrganizationId, userId);
      if (targetScope === null) {
        throw new Error("Choose an organization to save this setting.");
      }
      writeGenerations.current.set(
        targetScope,
        (writeGenerations.current.get(targetScope) ?? 0) + 1,
      );
      pendingWrites.current.set(
        targetScope,
        (pendingWrites.current.get(targetScope) ?? 0) + 1,
      );
      setStates((previous) => ({
        ...previous,
        [targetScope]: {
          ...(previous[targetScope] ?? PLANNING_DEFAULTS),
          showExternalEvents: show,
          failure: null,
        },
      }));
      try {
        const result = await setKnobOverride({
          feature: "meet",
          key: "show_external_calendar_events",
          scopeKind: "user",
          scopeId: userId,
          organizationId: resolvedOrganizationId,
          value: show,
        });
        if (!result.ok) throw new Error(knobRefusalSentence(result));
      } finally {
        const pending = (pendingWrites.current.get(targetScope) ?? 1) - 1;
        if (pending === 0) pendingWrites.current.delete(targetScope);
        else pendingWrites.current.set(targetScope, pending);
        // Any read begun while the save was in flight is stale even if the
        // organization rerendered after the save began. Start a fresh read
        // once the authoritative write has settled.
        writeGenerations.current.set(
          targetScope,
          (writeGenerations.current.get(targetScope) ?? 0) + 1,
        );
        setNonce((n) => n + 1);
      }
    },
  };
}
