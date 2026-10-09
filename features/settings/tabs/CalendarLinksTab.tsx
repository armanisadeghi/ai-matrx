"use client";

/**
 * CalendarLinksTab — the person's private calendar links (lane CAL-FEED-UI): each is one saved
 * view's dated rows, subscribed in Apple / Google Calendar. Rotate makes a new link (shown once);
 * Revoke ends it. A link is made from a view's menu ("Subscribe in your calendar…"), not here.
 */

import { CalendarClock } from "lucide-react";
import { CalendarLinks, RecordsUiProvider } from "@ai-matrx/records-ui";

import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { CALENDAR_FEED_PORT } from "@/features/calendar-feed/calendarFeedPort";
import { RECORDS_NOTIFY } from "@/features/unified-data/recordsNotify";

export default function CalendarLinksTab() {
  return (
    <>
      <SettingsSubHeader
        title="Calendar links"
        description="Views you subscribed to in your calendar app."
        icon={CalendarClock}
      />
      <SettingsSection title="Your links">
        <RecordsUiProvider value={{ notify: RECORDS_NOTIFY }}>
          <CalendarLinks port={CALENDAR_FEED_PORT} />
        </RecordsUiProvider>
      </SettingsSection>
    </>
  );
}
