"use client";

/**
 * The schedule source's live half: the read, the writes, and the refetch that
 * follows every write so the dock reflects the row the moment it changes.
 *
 * Reads go React → Supabase directly (`scheduler.system_schedule_alarms`, a
 * super-admin SECURITY DEFINER read). Re-enabling goes through the SAME
 * thunks the schedule's record page uses (`setSystemTaskEnabled` for a system
 * job, `toggleTaskEnabled` for a user schedule) — one write path per kind,
 * never a second. Muting writes `metadata.alarm_mute` on the row with the
 * canonical guarded jsonb merge.
 *
 * `enabled` is the super-admin gate: everyone else issues no request at all,
 * because the RPC's 42501 would otherwise be captured as a red error on every
 * page load for every user.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserEmail } from "@/lib/redux/selectors/userSelectors";
import {
  clearSystemScheduleAlarmMute,
  fetchSystemScheduleAlarms,
  muteSystemScheduleAlarm,
  type SystemScheduleAlarm,
} from "@/features/scheduling/service/queries";
import {
  setSystemTaskEnabled,
  toggleTaskEnabled,
} from "@/features/scheduling/redux/tasks/thunks";
import { ATTENTION_POLL_MS } from "../poll";
import type { AttentionSourceState } from "../types";
import {
  SCHEDULE_ALARM_SOURCE_ID,
  SCHEDULE_ALARM_SOURCE_LABEL,
  SCHEDULE_REVIEW_HREF,
  scheduleAlarmItems,
  summarizeScheduleAlarms,
} from "./schedule-alarms";

export const SCHEDULE_ALARMS_QUERY_KEY = ["admin-attention", "schedule-alarms"] as const;

export function useScheduleAlarmSource(enabled: boolean): AttentionSourceState {
  const dispatch = useAppDispatch();
  const email = useAppSelector(selectUserEmail);
  const queryClient = useQueryClient();

  const query = useQuery<SystemScheduleAlarm[]>({
    queryKey: SCHEDULE_ALARMS_QUERY_KEY,
    queryFn: fetchSystemScheduleAlarms,
    enabled,
    refetchInterval: ATTENTION_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: SCHEDULE_ALARMS_QUERY_KEY });
  };

  const items = scheduleAlarmItems(query.data ?? [], {
    reenable: async (row) => {
      if (row.kind === "tool") await dispatch(setSystemTaskEnabled(row.task_id, true));
      else await dispatch(toggleTaskEnabled(row.task_id, true));
      refetch();
    },
    mute: async (taskId, untilIso, note) => {
      await muteSystemScheduleAlarm({ taskId, untilIso, reason: note, by: email });
      refetch();
    },
    unmute: async (taskId) => {
      await clearSystemScheduleAlarmMute(taskId);
      refetch();
    },
  });

  const status: AttentionSourceState["status"] = !enabled
    ? "idle"
    : query.isError
      ? "failed"
      : query.data === undefined
        ? "loading"
        : "ok";

  return {
    id: SCHEDULE_ALARM_SOURCE_ID,
    label: SCHEDULE_ALARM_SOURCE_LABEL,
    items,
    status,
    error: query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null,
    // A direct DB read that fails must be SAID: a suspended schedule would be
    // invisible until it works, and silence here reads as healthy.
    loud: true,
    summarize: summarizeScheduleAlarms,
    review: { href: SCHEDULE_REVIEW_HREF, label: "Review all schedules" },
    refetch,
  };
}
