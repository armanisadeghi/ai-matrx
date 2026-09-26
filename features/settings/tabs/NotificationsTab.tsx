"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { toast } from "@/lib/toast";
import {
  NOTIFICATION_CHANNELS,
  clearNotificationPreference,
  loadNotificationScopes,
  loadNotificationSettings,
  setNotificationPreference,
  type NotificationEventSetting,
  type NotificationScope,
} from "../notification-preferences";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

// The canonical Notification System preferences tab: every event the platform
// can tell you about, with your per-channel choice. Absence of a choice means
// the event's declared default applies (shown per row). Chips/assists are NOT
// notifications and are deliberately not configured here.
//
// 🚨 A SWITCH GOVERNS A NAMED ORGANIZATION — never an unnamed set of them
// (hr_l3_116). Someone in two companies must be able to stop A's leave
// decisions without stopping B's, and must be able to SEE which one a switch is
// about. The screen opens on the organization they are working in; the picker
// appears only when there are at least two organizations to tell apart.
export default function NotificationsTab() {
  const [scopes, setScopes] = useState<NotificationScope[] | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationEventSetting[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNotificationScopes()
      .then(({ scopes: rows, initialOrganizationId }) => {
        if (cancelled) return;
        setScopes(rows);
        setScopeId(initialOrganizationId);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load your organizations.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
    setSettings(null);
    loadNotificationSettings(scopeId)
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
  }, [scopeId]);

  const activeScope = scopes?.find((scope) => scope.organizationId === scopeId) ?? null;
  // One organization is not a choice. Only a person with two or more has
  // anything to tell apart.
  const showScopePicker = (scopes?.length ?? 0) >= 2;

  const reload = useCallback(() => {
    if (!scopeId) return;
    loadNotificationSettings(scopeId)
      .then(setSettings)
      .catch(() => {
        /* the toast on the failing action already said what went wrong */
      });
  }, [scopeId]);

  const handleToggle = useCallback(
    (eventKey: string, channel: string, enabled: boolean) => {
      if (!scopeId) return;
      const toggleKey = `${eventKey}:${channel}`;
      setSavingKey(toggleKey);
      setSettings((current) =>
        (current ?? []).map((event) =>
          event.eventKey === eventKey
            ? {
                ...event,
                channels: { ...event.channels, [channel]: enabled },
                // Setting a switch creates this organization's own row — it
                // stops inheriting the moment it is touched.
                inherited: { ...event.inherited, [channel]: false },
              }
            : event,
        ),
      );
      setNotificationPreference(eventKey, channel, enabled, scopeId)
        .catch((error: unknown) => {
          reload();
          toast.error(
            error instanceof Error ? error.message : "Could not save that preference.",
          );
        })
        .finally(() => setSavingKey((k) => (k === toggleKey ? null : k)));
    },
    [scopeId, reload],
  );

  const handleReset = useCallback(
    (eventKey: string, channelKeys: readonly string[]) => {
      if (!scopeId) return;
      setSavingKey(`${eventKey}:reset`);
      Promise.all(
        channelKeys.map((key) =>
          clearNotificationPreference(eventKey, key, scopeId),
        ),
      )
        .then(() => reload())
        .catch((error: unknown) =>
          toast.error(
            error instanceof Error ? error.message : "Could not reset that preference.",
          ),
        )
        .finally(() => setSavingKey((k) => (k === `${eventKey}:reset` ? null : k)));
    },
    [scopeId, reload],
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
          <ErrorAlchemyMenu error={loadError} />
        </SettingsCallout>
      ) : (
        <>
          {showScopePicker && scopes && scopeId ? (
            <SettingsSection title="Who these settings are about">
              <SettingsSelect
                label="Applies to"
                description={`Only ${activeScope?.label ?? "this organization"}. Anything you leave untouched follows your most recent choice in another organization, or the event's default.`}
                value={scopeId}
                onValueChange={setScopeId}
                options={scopes.map((scope) => ({
                  value: scope.organizationId,
                  label: scope.label,
                }))}
                width="lg"
                last
              />
            </SettingsSection>
          ) : null}
          {settings === null ? (
            <SettingsSection title="Loading your notification events">
              <SettingsSwitch label="Loading…" checked={false} onCheckedChange={() => {}} disabled last />
            </SettingsSection>
          ) : settings.length === 0 ? (
            <SettingsCallout tone="info" title="No notification events yet">
              Features register their events here as they come online.
            </SettingsCallout>
          ) : (
            settings.map((event) => {
              const availableChannels = NOTIFICATION_CHANNELS.filter(
                ({ key }) => event.availableChannels[key],
              );
              const hasOwnRow = availableChannels.some(
                ({ key }) => !event.inherited[key],
              );
              return (
                <SettingsSection
                  key={event.eventKey}
                  title={event.label}
                  description={event.description ?? undefined}
                >
                  {availableChannels.map(({ key, label }, index) => (
                    <SettingsSwitch
                      key={key}
                      label={label}
                      description={
                        showScopePicker && event.inherited[key]
                          ? "Not set here — following your choice elsewhere or the event default."
                          : event.defaults[key]
                            ? "On by default for this event."
                            : "Off by default for this event."
                      }
                      checked={Boolean(event.channels[key])}
                      onCheckedChange={(enabled: boolean) =>
                        handleToggle(event.eventKey, key, enabled)
                      }
                      disabled={savingKey === `${event.eventKey}:${key}`}
                      last={index === availableChannels.length - 1 && !(hasOwnRow && showScopePicker)}
                    />
                  ))}
                  {hasOwnRow && showScopePicker ? (
                    <SettingsButton
                      label={`Set separately for ${activeScope?.label ?? "this organization"}`}
                      description="Go back to following your choice elsewhere or the event default."
                      actionLabel="Stop setting it here"
                      kind="outline"
                      size="sm"
                      onClick={() =>
                        handleReset(
                          event.eventKey,
                          availableChannels.map(({ key }) => key),
                        )
                      }
                      loading={savingKey === `${event.eventKey}:reset`}
                      last
                    />
                  ) : null}
                </SettingsSection>
              );
            })
          )}
        </>
      )}
    </>
  );
}
