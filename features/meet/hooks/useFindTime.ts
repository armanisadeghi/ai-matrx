"use client";

// features/meet/hooks/useFindTime.ts
//
// FIND A TIME (Meet wave 4): free/busy for the host and every guest who has an
// account, from `communication.calendar_free_busy` (busy intervals only — never
// a title or a detail of anyone else's event), then the first open slots in the
// host's working day (`lib/find-time.ts`). Asked on demand, never polled.

import { useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  parseFreeBusy,
  suggestSlots,
  type FreeBusyPerson,
  type Slot,
} from "@/features/meet/lib/find-time";
import type { MeetPlanningKnobs } from "@/features/meet/hooks/useMeetPlanningKnobs";

export interface FindTimeResult {
  readonly slots: readonly Slot[];
  readonly people: readonly FreeBusyPerson[];
}

export function useFindTime() {
  const [state, setState] = useState<{
    loading: boolean;
    failure: string | null;
    result: FindTimeResult | null;
  }>({ loading: false, failure: null, result: null });

  const find = async (args: {
    userIds: readonly string[];
    zone: string;
    durationMinutes: number;
    knobs: MeetPlanningKnobs;
  }) => {
    setState({ loading: true, failure: null, result: null });
    const now = new Date();
    const to = new Date(now.getTime() + args.knobs.horizonDays * 86_400_000);
    const { data, error } = await supabase
      .schema("communication")
      .rpc("calendar_free_busy", {
        p_user_ids: [...new Set(args.userIds)],
        p_from: now.toISOString(),
        p_to: to.toISOString(),
      });
    if (error) {
      setState({ loading: false, failure: error.message, result: null });
      return;
    }
    const freeBusy = parseFreeBusy(data);
    const slots = suggestSlots(freeBusy.busy, {
      zone: args.zone,
      durationMinutes: args.durationMinutes,
      stepMinutes: args.knobs.stepMinutes,
      count: args.knobs.suggestions,
      horizonDays: args.knobs.horizonDays,
      hours: args.knobs.hours,
      now,
    });
    setState({
      loading: false,
      failure: null,
      result: { slots, people: freeBusy.people },
    });
  };

  return {
    ...state,
    find,
    clear: () => setState({ loading: false, failure: null, result: null }),
  };
}
