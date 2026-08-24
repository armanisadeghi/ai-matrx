"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { toast } from "@/lib/toast";
import {
  NOTIFICATION_CHANNELS,
  loadNotificationSettings,
  setNotificationPreference,
  type NotificationEventSetting,
} from "../notification-preferences";

// The canonical Notification System preferences tab: every event the platform
// can tell you about, with your per-channel choice. Absence of a choice means
// the event's declared default applies (shown per row). Chips/assists are NOT
// notifications and are deliberately not configured here.
export default function NotificationsTab() {
  const [settings, setSettings] = useState<NotificationEventSetting[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNotificationSettings()
      .then((rows) => {
        if (!cancelled) setSettings(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load notification settings.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(
    (eventKey: string, channel: string, enabled: boolean) => {
      const toggleKey = `${eventKey}:${channel}`;
      setSavingKey(toggleKey);
      setSettings((current) =>
        (current ?? []).map((event) =>
          event.eventKey === eventKey
            ? { ...event, channels: { ...event.channels, [channel]: enabled } }
            : event,
        ),
      );
      setNotificationPreference(eventKey, channel, enabled)
        .catch((error: unknown) => {
          setSettings((current) =>
            (current ?? []).map((event) =>
              event.eventKey === eventKey
                ? { ...event, channels: { ...event.channels, [channel]: !enabled } }
                : event,
            ),
          );
          toast.error(
            error instanceof Error ? error.message : "Could not save that preference.",
          );
        })
        .finally(() => setSavingKey((k) => (k === toggleKey ? null : k)));
    },
    [],
  );

  return (
    <>
      <SettingsSubHeader
        title="Notifications"
        description="Choose how the platform reaches you, per event. Each event has a sensible default until you change it."
        icon={Bell}
      />
      {loadError ? (
        <SettingsCallout tone="error" title="Notification settings unavailable">
          {loadError}
        </SettingsCallout>
      ) : settings === null ? (
        <SettingsSection title="Loading your notification events">
          <SettingsSwitch label="Loading…" checked={false} onCheckedChange={() => {}} disabled last />
        </SettingsSection>
      ) : settings.length === 0 ? (
        <SettingsCallout tone="info" title="No notification events yet">
          Features register their events here as they come online.
        </SettingsCallout>
      ) : (
        settings.map((event) => (
          <SettingsSection
            key={event.eventKey}
            title={event.label}
            description={event.description ?? undefined}
          >
            {NOTIFICATION_CHANNELS.map(({ key, label }, index) => (
              <SettingsSwitch
                key={key}
                label={label}
                description={
                  event.defaults[key]
                    ? "On by default for this event."
                    : "Off by default for this event."
                }
                checked={Boolean(event.channels[key])}
                onCheckedChange={(enabled: boolean) =>
                  handleToggle(event.eventKey, key, enabled)
                }
                disabled={savingKey === `${event.eventKey}:${key}`}
                last={index === NOTIFICATION_CHANNELS.length - 1}
              />
            ))}
          </SettingsSection>
        ))
      )}
    </>
  );
}
