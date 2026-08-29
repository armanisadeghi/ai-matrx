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

// The canonical Notification System preferences tab: every event the platform
// can tell you about, with your per-channel choice. Absence of a choice means
// the event's declared default applies (shown per row). Chips/assists are NOT
// notifications and are deliberately not configured here.
//
// 🚨 A SWITCH GOVERNS A NAMED EMPLOYER, OR IT GOVERNS EVERYWHERE — never an
// unnamed set of employers (hr_l3_116). Someone employed by two companies must be
// able to stop A's leave decisions without stopping B's, and must be able to SEE
// which one a switch is about. The employer picker therefore appears only when
// there are at least two employers to tell apart; with one employer (or none) the
// distinction is not real, so the screen is exactly what it always was and the
// switches write the person's default-everywhere row, which the server's ladder
// applies in that one employer anyway.
export default function NotificationsTab() {
  const [scopes, setScopes] = useState<NotificationScope[] | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationEventSetting[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNotificationScopes()
      .then((rows) => {
        if (cancelled) return;
        setScopes(rows);
        setScopeId(rows[0]?.organizationId ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load your employers.",
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
  const isGlobalScope = activeScope?.isGlobal ?? true;
  // One employer is not a choice. Only a person with two or more has anything to
  // tell apart, and they are exactly who the org dimension exists for.
  const showScopePicker = (scopes?.length ?? 0) >= 3;

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
                // Setting a switch in an employer's scope creates that employer's
                // own row — it stops inheriting the moment it is touched.
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
    (eventKey: string) => {
      if (!scopeId || isGlobalScope) return;
      setSavingKey(`${eventKey}:reset`);
      Promise.all(
        NOTIFICATION_CHANNELS.map(({ key }) =>
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
    [scopeId, isGlobalScope, reload],
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
      ) : (
        <>
          {showScopePicker && scopes && scopeId ? (
            <SettingsSection title="Who these settings are about">
              <SettingsSelect
                label="Applies to"
                description={
                  isGlobalScope
                    ? "Your default everywhere. An employer you have set separately below keeps its own choice."
                    : `Only ${activeScope?.label}. Anything you leave untouched follows your default everywhere.`
                }
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
              const hasOwnRow =
                !isGlobalScope &&
                NOTIFICATION_CHANNELS.some(({ key }) => !event.inherited[key]);
              return (
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
                        !isGlobalScope && event.inherited[key]
                          ? "Following your default everywhere."
                          : event.defaults[key]
                            ? "On by default for this event."
                            : "Off by default for this event."
                      }
                      checked={Boolean(event.channels[key])}
                      onCheckedChange={(enabled: boolean) =>
                        handleToggle(event.eventKey, key, enabled)
                      }
                      disabled={savingKey === `${event.eventKey}:${key}`}
                      last={index === NOTIFICATION_CHANNELS.length - 1 && !hasOwnRow}
                    />
                  ))}
                  {hasOwnRow ? (
                    <SettingsButton
                      label={`Set separately for ${activeScope?.label ?? "this employer"}`}
                      description="Go back to following your default everywhere."
                      actionLabel="Use my default"
                      kind="outline"
                      size="sm"
                      onClick={() => handleReset(event.eventKey)}
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
