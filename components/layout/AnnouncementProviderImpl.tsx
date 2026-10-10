"use client";

/**
 * Announcement Provider — heavy body (Impl).
 *
 * Calls the `getActiveAnnouncements` server action and renders the
 * `SystemAnnouncementBanner` when there's an unviewed active announcement.
 * Rows marked `metadata.alarm` are spend alarms: they render in the loud
 * `SpendAlarmPanel` instead, errors first, and only while their shared record
 * (`billing.spend_alarm`) rings — resolved and snoozed records stay quiet. Lazy-loaded by
 * `AnnouncementProvider.tsx` ONLY after shell data has loaded, so the server
 * action's dep graph (supabase admin client + feedback types + modal markup)
 * never enters the static graph of any route.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveAnnouncements } from "@/actions/feedback.actions";
import { SystemAnnouncement } from "@/types/feedback.types";
import SystemAnnouncementBanner from "./SystemAnnouncementBanner";
import SpendAlarmPanel from "./SpendAlarmPanel";
import {
  isAgentSeat,
  nameSpendAlarm,
  readClosedAlarms,
  sortSpendAlarms,
  toSpendAlarm,
  writeClosedAlarms,
  type SpendAlarm,
} from "./spendAlarm";
import { selectUserAppMetadata, selectUserEmail, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { fetchUserDisplayNames } from "@/features/mandates/notes";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import {
  fetchSpendAlarmStatuses,
  isRinging,
  setSpendAlarmStatus,
  type AlarmStatus,
} from "@/features/admin/spend-alarms/spendAlarms";

export default function AnnouncementProviderImpl() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Map<string, { status: AlarmStatus; snoozed_until: string | null }>>(new Map());
  const [quieted, setQuieted] = useState<string[]>([]);
  const [fetched, setFetched] = useState<SystemAnnouncement[]>([]);
  const [currentAnnouncementIndex] = useState(0);
  const userId = useAppSelector(selectUserId);
  const email = useAppSelector(selectUserEmail);
  const appMetadata = useAppSelector(selectUserAppMetadata);
  const seat = isAgentSeat({ email, appMetadata });
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    if (userId) setClosed(readClosedAlarms(userId));
  }, [userId]);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const viewedAnnouncements = useAppSelector(
    (state) => state.userPreferences.system.viewedAnnouncements,
  );

  useEffect(() => {
    const fetchAnnouncements = async () => {
      const result = await getActiveAnnouncements();
      if (result.success && result.data) setFetched(result.data);
    };

    fetchAnnouncements();
  }, []);

  useEffect(() => {
    const ids = [...new Set(fetched.map((a) => toSpendAlarm(a)?.recordId).filter((id): id is string => !!id))];
    if (ids.length === 0) return;
    let alive = true;
    // read-gate-exempt: a record that cannot be read keeps ringing (a missed alarm costs more than a stale one)
    fetchSpendAlarmStatuses(ids).then((m) => alive && setStatuses(m)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetched]);

  useEffect(() => {
    const ids = fetched
      .map((a) => toSpendAlarm(a)?.subjectUserId)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return;
    let alive = true;
    // read-gate-exempt: display names are enrichment beside alarms already shown; an unresolved name falls back to the id
    fetchUserDisplayNames(ids).then((m) => alive && setNames(m)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetched]);

  const { announcements, alarms } = useMemo(() => {
    const plain: SystemAnnouncement[] = [];
    const found: SpendAlarm[] = [];
    for (const a of fetched) {
      const alarm = toSpendAlarm(a);
      if (alarm) {
        const record = alarm.recordId ? statuses.get(alarm.recordId) : undefined;
        if ((!record || isRinging(record)) && !(alarm.recordId && quieted.includes(alarm.recordId))) found.push(alarm);
      } else if (!viewedAnnouncements.includes(a.id)) {
        plain.push(a);
      }
    }
    return { announcements: plain, alarms: sortSpendAlarms(found.map((a) => nameSpendAlarm(a, names))) };
  }, [fetched, viewedAnnouncements, names, statuses, quieted]);

  const shown = useMemo(
    () => (seat ? [] : alarms.filter((a) => !closed.includes(a.ackKey))),
    [alarms, closed, seat],
  );
  const closeForSession = () => {
    const keys = [...new Set([...closed, ...alarms.map((a) => a.ackKey)])];
    setClosed(keys);
    if (userId) writeClosedAlarms(userId, keys);
  };

  const changeStatus = async (recordId: string | null, status: AlarmStatus, note?: string) => {
    if (!recordId) return;
    try {
      await setSpendAlarmStatus(recordId, status, { note, snoozeHours: 24 });
      setQuieted((q) => [...q, recordId]);
      toast.success(status === "resolved" ? "Alarm resolved for everyone" : "Alarm snoozed for 24 hours");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const currentAnnouncement = announcements[currentAnnouncementIndex];

  return (
    <>
      <SpendAlarmPanel
        alarms={shown}
        onOpen={(href) => {
          closeForSession();
          router.push(href);
        }}
        onResolve={(alarm, note) => void changeStatus(alarm.recordId, "resolved", note)}
        onSnooze={(alarm) => void changeStatus(alarm.recordId, "snoozed")}
        onClose={closeForSession}
      />
      {currentAnnouncement ? (
        <SystemAnnouncementBanner
          key={currentAnnouncement.id}
          announcement={currentAnnouncement}
        />
      ) : null}
    </>
  );
}
