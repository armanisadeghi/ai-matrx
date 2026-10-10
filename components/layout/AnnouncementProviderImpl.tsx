"use client";

/**
 * Announcement Provider — heavy body (Impl).
 *
 * Calls the `getActiveAnnouncements` server action and renders the
 * `SystemAnnouncementBanner` when there's an unviewed active announcement.
 * Rows marked `metadata.alarm` are spend alarms: they render in the loud
 * `SpendAlarmPanel` instead, errors first. Lazy-loaded by
 * `AnnouncementProvider.tsx` ONLY after shell data has loaded, so the server
 * action's dep graph (supabase admin client + feedback types + modal markup)
 * never enters the static graph of any route.
 */

import React, { useEffect, useMemo, useState } from "react";
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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";

export default function AnnouncementProviderImpl() {
  const dispatch = useAppDispatch();
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
        if (!viewedAnnouncements.includes(alarm.ackKey)) found.push(alarm);
      } else if (!viewedAnnouncements.includes(a.id)) {
        plain.push(a);
      }
    }
    return { announcements: plain, alarms: sortSpendAlarms(found.map((a) => nameSpendAlarm(a, names))) };
  }, [fetched, viewedAnnouncements, names]);

  const shown = useMemo(
    () => (seat ? [] : alarms.filter((a) => !closed.includes(a.ackKey))),
    [alarms, closed, seat],
  );
  const closeForSession = () => {
    const keys = [...new Set([...closed, ...alarms.map((a) => a.ackKey)])];
    setClosed(keys);
    if (userId) writeClosedAlarms(userId, keys);
  };

  const acknowledge = (keys: string[]) => {
    dispatch(
      setModulePreferences({
        module: "system",
        preferences: { viewedAnnouncements: [...viewedAnnouncements, ...keys] },
      }),
    );
  };

  const currentAnnouncement = announcements[currentAnnouncementIndex];

  return (
    <>
      <SpendAlarmPanel
        alarms={shown}
        onAcknowledge={(key) => acknowledge([key])}
        onAcknowledgeAll={() => acknowledge(shown.map((a) => a.ackKey))}
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
