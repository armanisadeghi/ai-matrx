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
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
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
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";

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
  // The screen opens on the organization the person is working in. With none
  // selected the read is HELD — their organizations are shown inline and the
  // screen loads once one is chosen — never an error box carrying the
  // transport's "Select an organization before sending this request."
  const { organizationId, organizationState } = useOrganizationRequired();

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    loadNotificationScopes()
      .then(({ scopes: rows, initialOrganizationId }) => {
        if (cancelled) return;
        setLoadError(null);
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
  }, [organizationId]);

  useEffect(() => {
    if (!scopeId) return;
    let cancelled = false;
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
      {organizationState !== "ready" ? (
        <OrganizationContextNotice
          state={organizationState}
          what="Your notification settings"
          description="Notification choices are kept per organization. Choose the one you are working in."
          compact
          className="rounded-lg border border-border bg-card"
        />
      ) : loadError ? (
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
                onValueChange={(nextScopeId: string) => {
                  // Clear the previous organization's rows so the loader
                  // shows instead of the old switches under the new name.
                  setSettings(null);
                  setScopeId(nextScopeId);
                }}
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
            <div className="flex items-center justify-center py-8">
              <SuspenseLoader size="sm" message="Loading your notification events…" />
            </div>
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
                      // The default, once per row. Where an untouched row's value
                      // comes from is said once, on "Applies to" above — not
                      // repeated under every switch.
                      description={event.defaults[key] ? "On by default" : "Off by default"}
                      modified={Boolean(event.channels[key]) !== Boolean(event.defaults[key])}
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
