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

import { useEffect, useState } from "react";
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

export function useMeetPlanningKnobs(
  organizationId: string | null,
  userId: string | null,
): MeetPlanningKnobsResult {
  const [state, setState] = useState<MeetPlanningKnobs>(PLANNING_DEFAULTS);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (userId === null) return undefined;
    let live = true;
    const read = (key: string) =>
      supabase.schema("platform").rpc("knob_resolve", {
        p_feature: "meet",
        p_key: key,
        p_organization_id: organizationId as string,
        p_user_id: userId,
      });
    void Promise.all(KEYS.map(read)).then(
      ([show, start, end, days, step, count, horizon]) => {
        if (!live) return;
        const failure = [show, start, end, days, step, count, horizon].find(
          (result) => result.error,
        )?.error;
        if (failure) {
          setState({
            ...PLANNING_DEFAULTS,
            failure:
              failure.message || "Your calendar settings could not be read.",
            showExternalEvents: false,
          });
          return;
        }
        setState({
          loaded: true,
          failure: null,
          showExternalEvents: typeof show.data === "boolean" ? show.data : true,
          hours: {
            start: parseClock(start.data, DEFAULT_WORKING_HOURS.start),
            end: parseClock(end.data, DEFAULT_WORKING_HOURS.end),
            days: parseWorkingDays(days.data),
          },
          stepMinutes: positive(step.data, PLANNING_DEFAULTS.stepMinutes),
          suggestions: positive(count.data, PLANNING_DEFAULTS.suggestions),
          horizonDays: positive(horizon.data, PLANNING_DEFAULTS.horizonDays),
        });
      },
    );
    return () => {
      live = false;
    };
  }, [organizationId, userId, nonce]);

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
      setState((s) => ({ ...s, showExternalEvents: show }));
      const result = await setKnobOverride({
        feature: "meet",
        key: "show_external_calendar_events",
        scopeKind: "user",
        scopeId: userId,
        organizationId: resolvedOrganizationId,
        value: show,
      });
      if (!result.ok) {
        setNonce((n) => n + 1);
        throw new Error(knobRefusalSentence(result));
      }
    },
  };
}
