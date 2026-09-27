"use client";

import { Activity, Megaphone } from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";

export default function SystemTab() {
  const viewedAnnouncements = useSelector(
    (s: RootState) => s.userPreferences.system?.viewedAnnouncements ?? [],
  );
  const feedbackViews = useSelector(
    (s: RootState) => s.userPreferences.system?.feedbackFeatureViewCount ?? 0,
  );

  return (
    <>
      <SettingsSubHeader
        title="System"
        description="Usage counters and tracking fields used by in-app onboarding."
        icon={Activity}
      />

      <SettingsCallout tone="info">
        These values are maintained automatically by the product — you rarely
        need to look at them. They're shown here for transparency.
      </SettingsCallout>

      <PreferencesLoadGate what="your usage counters">
        <SettingsSection title="Announcements" icon={Megaphone}>
          <SettingsReadOnlyValue
            label="Announcements viewed"
            description="Unique announcement IDs you've dismissed."
            value={String(viewedAnnouncements.length)}
          />
          <SettingsReadOnlyValue
            label="Feedback prompts seen"
            description="How many times the feedback callout has appeared."
            value={String(feedbackViews)}
            last
          />
        </SettingsSection>
      </PreferencesLoadGate>
    </>
  );
}
