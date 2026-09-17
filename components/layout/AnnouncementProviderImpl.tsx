"use client";

/**
 * Announcement Provider — heavy body (Impl).
 *
 * Calls the `getActiveAnnouncements` server action and renders the
 * `SystemAnnouncementBanner` when there's an unviewed active announcement.
 * Lazy-loaded by `AnnouncementProvider.tsx` ONLY after shell data has
 * loaded, so the server action's dep graph (supabase admin client +
 * feedback types + modal markup) never enters the static graph of any
 * route.
 */

import React, { useEffect, useState } from "react";
import { getActiveAnnouncements } from "@/actions/feedback.actions";
import { SystemAnnouncement } from "@/types/feedback.types";
import SystemAnnouncementBanner from "./SystemAnnouncementBanner";
import { useAppSelector } from "@/lib/redux/hooks";

export default function AnnouncementProviderImpl() {
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [currentAnnouncementIndex] = useState(0);
  const viewedAnnouncements = useAppSelector(
    (state) => state.userPreferences.system.viewedAnnouncements,
  );

  useEffect(() => {
    const fetchAnnouncements = async () => {
      const result = await getActiveAnnouncements();
      if (result.success && result.data) {
        const unviewedAnnouncements = result.data.filter(
          (announcement) => !viewedAnnouncements.includes(announcement.id),
        );
        setAnnouncements(unviewedAnnouncements);
      }
    };

    fetchAnnouncements();
  }, [viewedAnnouncements]);

  const currentAnnouncement = announcements[currentAnnouncementIndex];

  if (!currentAnnouncement) return null;

  return (
    <SystemAnnouncementBanner
      key={currentAnnouncement.id}
      announcement={currentAnnouncement}
    />
  );
}
