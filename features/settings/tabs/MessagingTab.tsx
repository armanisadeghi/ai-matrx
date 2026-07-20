"use client";

import { useState } from "react";
import { Bell, BellOff, Monitor, Volume2 } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { useSetting } from "../hooks/useSetting";
import {
  playNotificationSound,
  requestNotificationPermission,
  getNotificationPermission,
} from "@/features/messaging/utils/notificationSound";
import { SmsEnrollmentSettingsSection } from "@/features/sms/components/SmsEnrollmentSettingsSection";
import { useIsMounted } from "@/hooks/use-is-mounted";

type PermissionStatus = "granted" | "denied" | "default" | "unsupported";

/**
 * Messaging tab — first production tab rebuilt with Phase 1 primitives +
 * Phase 3 `useSetting()`. Parity target: `components/user-preferences/MessagingPreferences.tsx`.
 *
 * Every piece of state flows through `useSetting` — this tab never imports
 * Redux actions or selectors directly.
 */
export default function MessagingTab() {
  const [soundEnabled, setSoundEnabled] = useSetting<boolean>(
    "userPreferences.messaging.notificationSoundEnabled",
  );
  const [volume, setVolume] = useSetting<number>(
    "userPreferences.messaging.notificationVolume",
  );
  const [desktopEnabled, setDesktopEnabled] = useSetting<boolean>(
    "userPreferences.messaging.showDesktopNotifications",
  );

  // Permission state is a browser concern, not a Redux concern — it lives in
  // local state. Re-check on mount and after any permission mutation.
  const isMounted = useIsMounted();
  const [permissionOverride, setPermissionOverride] =
    useState<PermissionStatus | null>(null);
  const permission =
    permissionOverride ?? (isMounted ? getNotificationPermission() : "unsupported");

  const handleEnableDesktop = async () => {
    const granted = await requestNotificationPermission();
    setPermissionOverride(getNotificationPermission());
    if (granted) setDesktopEnabled(true);
  };

  return (
    <>
      <SettingsSubHeader
        title="Messaging"
        description="Sound and desktop notifications for chat and mentions."
        icon={Bell}
      />

      <SettingsSection title="Sound" icon={Volume2}>
        <SettingsSwitch
          label="Notification sound"
          description="Play a sound when a new message arrives."
          checked={soundEnabled}
          onCheckedChange={setSoundEnabled}
          last={!soundEnabled}
        />
        {soundEnabled && (
          <>
            <SettingsSlider
              label="Volume"
              description="How loud notification sounds should play."
              value={volume}
              onValueChange={setVolume}
              min={0}
              max={100}
              step={5}
              unit="%"
              minLabel="Silent"
              midLabel="50%"
              maxLabel="Loud"
            />
            <SettingsButton
              label="Test sound"
              description="Play a sample at the current volume."
              actionLabel="Play"
              actionIcon={Volume2}
              kind="outline"
              onClick={() => playNotificationSound(volume)}
              last
            />
          </>
        )}
      </SettingsSection>

      <SettingsSection title="Desktop" icon={Monitor}>
        {permission === "unsupported" && (
          <SettingsReadOnlyValue
            label="Desktop notifications"
            description="Your browser doesn't support the Notifications API."
            value="Not supported"
            icon={BellOff}
            last
          />
        )}

        {permission === "denied" && (
          <>
            <SettingsReadOnlyValue
              label="Desktop notifications"
              description="Permission was denied at the browser level."
              value="Blocked"
              icon={BellOff}
              last
            />
          </>
        )}

        {permission === "default" && (
          <SettingsButton
            label="Desktop notifications"
            description="Browser permission is required. You'll be prompted once."
            actionLabel="Enable"
            actionIcon={Bell}
            kind="default"
            onClick={handleEnableDesktop}
            last
          />
        )}

        {permission === "granted" && (
          <SettingsSwitch
            label="Show desktop notifications"
            description="Display system banners for new messages."
            checked={desktopEnabled}
            onCheckedChange={setDesktopEnabled}
            last
          />
        )}
      </SettingsSection>

      {permission === "denied" && (
        <SettingsCallout tone="warning">
          Notifications are blocked. Click the lock icon in your browser's
          address bar and allow notifications for this site to change this.
        </SettingsCallout>
      )}

      <SmsEnrollmentSettingsSection />
    </>
  );
}
