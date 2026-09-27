"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronRight } from "lucide-react";
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ai-matrx/design-system";
import { ResetTapButton } from "@ai-matrx/tap-target/buttons";
import { SearchInput } from "@/components/official/SearchInput";
import { cn } from "@/lib/utils";
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
import { useSurfaceScopeContribution, useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ROLE_BOUND_AREAS,
  notificationArea,
  notificationAreaLabel,
  personFacingEventDescription,
} from "../notification-display";
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

  // With no organization selected the screen still SHOWS every notice with
  // what reaches the person today (their most recent choice anywhere, else the
  // notice's default). Changing one needs an organization: every saved choice
  // is filed under one, and nothing may pick it for them.
  useEffect(() => {
    if (organizationId || organizationState !== "required") return;
    let cancelled = false;
    loadNotificationSettings("")
      .then((rows) => {
        if (!cancelled) setSettings(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load notification settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, organizationState]);

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

  // ── Search and grouping ────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  // Areas the person opened or closed; absent = the default (role-bound areas
  // such as HR start folded, everything else starts open).
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const needle = query.trim().toLowerCase();
  const matches = (event: NotificationEventSetting) =>
    !needle ||
    event.label.toLowerCase().includes(needle) ||
    (personFacingEventDescription(event.description) ?? "").toLowerCase().includes(needle) ||
    notificationAreaLabel(notificationArea(event.eventKey)).toLowerCase().includes(needle);
  const groups = new Map<string, NotificationEventSetting[]>();
  for (const event of settings ?? []) {
    if (!matches(event)) continue;
    const area = notificationArea(event.eventKey);
    groups.set(area, [...(groups.get(area) ?? []), event]);
  }
  const orderedAreas = [...groups.keys()].sort((a, b) => {
    const roleA = ROLE_BOUND_AREAS.has(a) ? 1 : 0;
    const roleB = ROLE_BOUND_AREAS.has(b) ? 1 : 0;
    return roleA - roleB || notificationAreaLabel(a).localeCompare(notificationAreaLabel(b));
  });
  const isOpen = (area: string) =>
    needle ? true : (openOverride[area] ?? !ROLE_BOUND_AREAS.has(area));

  // ── Agent twin: what the grid shows, and the same switches ────────────
  // Role-bound areas (HR: ~176 notices) are summarized unless the person
  // changed one, so the page stays inside its context budget.
  useSurfaceScopeContribution("matrx-user/settings", "notifications-tab", () =>
    settings === null
      ? {}
      : {
          notification_scope: activeScope ? { id: activeScope.organizationId, name: activeScope.label } : null,
          // Why a change may be refused: choices are saved per organization,
          // so with none selected the notices are shown read-only.
          organization_state: organizationState,
          notification_events: settings
            .filter((event) => {
              const area = notificationArea(event.eventKey);
              if (!ROLE_BOUND_AREAS.has(area)) return true;
              return NOTIFICATION_CHANNELS.some(
                ({ key }) => event.availableChannels[key] && event.channels[key] !== Boolean(event.defaults[key]),
              );
            })
            .map((event) => ({
              event_key: event.eventKey,
              label: event.label,
              area: notificationAreaLabel(notificationArea(event.eventKey)),
              required: event.mandatory,
              channels: Object.fromEntries(
                NOTIFICATION_CHANNELS.filter(({ key }) => event.availableChannels[key]).map(({ key }) => [
                  key,
                  event.channels[key],
                ]),
              ),
            })),
          notification_areas: [...new Set((settings ?? []).map((e) => notificationArea(e.eventKey)))].map((area) => ({
            area: notificationAreaLabel(area),
            events: (settings ?? []).filter((e) => notificationArea(e.eventKey) === area).length,
          })),
        },
  );

  const validateNotificationWrites = (value: unknown) => {
    if (!Array.isArray(value) || value.length === 0)
      throw new Error("notification_preferences expects a non-empty array of { event_key, channel, enabled }.");
    if (!settings) throw new Error("Notification settings are not loaded yet.");
    if (!scopeId)
      throw new Error("No organization is selected (organization_state). Choices are saved per organization; ask the person to choose one first.");
    for (const item of value as Array<Record<string, unknown>>) {
      const event = settings.find((e) => e.eventKey === item?.event_key);
      if (!event) throw new Error(`Unknown notification event_key: ${String(item?.event_key)}.`);
      const channel = String(item.channel);
      if (!event.availableChannels[channel])
        throw new Error(`${event.label} cannot be sent by ${channel}. Allowed: ${NOTIFICATION_CHANNELS.filter(({ key }) => event.availableChannels[key]).map(({ key }) => key).join(", ")}.`);
      if (typeof item.enabled !== "boolean") throw new Error(`enabled must be true or false for ${event.eventKey}.`);
      if (event.mandatory && item.enabled === false) {
        const stillOn = NOTIFICATION_CHANNELS.filter(({ key }) => event.availableChannels[key] && key !== channel && event.channels[key]);
        if (stillOn.length === 0) throw new Error(`${event.label} is required: at least one channel must stay on.`);
      }
    }
  };
  useSurfaceWriteHandlers("matrx-user/settings", {
    notification_preferences: {
      validate: validateNotificationWrites,
      apply: async (value: unknown) => {
        validateNotificationWrites(value);
        const writes = value as Array<{ event_key: string; channel: string; enabled: boolean }>;
        for (const w of writes) {
          await setNotificationPreference(w.event_key, w.channel, w.enabled, scopeId);
        }
        // Re-read before answering, so the agent's next look at the page
        // shows what landed rather than the pre-write copy.
        if (scopeId) setSettings(await loadNotificationSettings(scopeId));
        await new Promise((r) => setTimeout(r, 100));
        return {
          summary: `Saved ${writes.length} notification choice${writes.length === 1 ? "" : "s"} for ${activeScope?.label ?? "this organization"}.`,
          data: { saved: writes, organization_id: scopeId },
        };
      },
    },
  });

  const channelColumns = NOTIFICATION_CHANNELS.map((c) => ({
    ...c,
    short: c.key === "sms" ? "Text" : c.label,
  }));

  return (
    <>
      <SettingsSubHeader
        title="Notifications"
        description="Choose which channels each notice reaches you on. A notice follows its default until you change it."
        icon={Bell}
      />
      {organizationState !== "ready" ? (
        <OrganizationContextNotice
          state={organizationState}
          what="Changing your notifications"
          description="These are what reach you today. Your choices are saved per organization, so choose the one you are working in to change them."
          compact
          className="mb-3 rounded-lg border border-border bg-card"
        />
      ) : null}
      {loadError ? (
        <SettingsCallout tone="error" title="Notification settings unavailable">
          {loadError}
          <ErrorAlchemyMenu error={loadError} />
        </SettingsCallout>
      ) : settings === null ? (
        <div className="flex items-center justify-center py-8">
          <SuspenseLoader size="sm" message="Loading your notification events…" />
        </div>
      ) : settings.length === 0 ? (
        <SettingsCallout tone="info" title="No notification events yet">
          Features add their notices here as they come online.
        </SettingsCallout>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search notices"
              aria-label="Search notices"
              debounceTime={0}
              className="min-w-48 flex-1"
            />
            {showScopePicker && scopes && scopeId ? (
              <Select
                value={scopeId}
                onValueChange={(next) => {
                  // Clear the previous organization's rows so the loader shows
                  // instead of the old switches under the new name.
                  setSettings(null);
                  setScopeId(next);
                }}
              >
                <SelectTrigger className="w-56" aria-label="Organization these choices apply to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((scope) => (
                    <SelectItem key={scope.organizationId} value={scope.organizationId}>
                      For {scope.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {orderedAreas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No notices match.</p>
          ) : (
            <div className="matrx-touch-targets overflow-hidden rounded-lg border border-border bg-card">
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)_2.75rem] items-center border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)_2.75rem]">
                <span>Notice</span>
                {channelColumns.map((c) => (
                  <span key={c.key} className="text-center">{c.short}</span>
                ))}
                <span className="sr-only">Reset</span>
              </div>
              {orderedAreas.map((area) => {
                const events = groups.get(area) ?? [];
                return (
                  <Collapsible
                    key={area}
                    open={isOpen(area)}
                    onOpenChange={(open) => setOpenOverride((prev) => ({ ...prev, [area]: open }))}
                  >
                    <CollapsibleTrigger className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-left text-sm font-medium text-foreground">
                      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen(area) && "rotate-90")} aria-hidden />
                      <span className="flex-1">{notificationAreaLabel(area)}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {events.length}
                        {ROLE_BOUND_AREAS.has(area) ? " · only if you work in HR or are an employee, candidate or manager" : ""}
                      </span>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {events.map((event) => {
                        const description = personFacingEventDescription(event.description);
                        const onChannels = channelColumns.filter(({ key }) => event.availableChannels[key] && event.channels[key]);
                        const hasOwnRow = channelColumns.some(({ key }) => event.availableChannels[key] && !event.inherited[key]);
                        return (
                          <div
                            key={event.eventKey}
                            className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)_2.75rem] items-center border-b border-border/50 px-3 py-1.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)_2.75rem]"
                          >
                            <div className="min-w-0 py-1">
                              <div className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
                                <span>{event.label}</span>
                                {event.mandatory ? (
                                  <TooltipProvider delayDuration={150}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-xs font-normal">Required</Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        You can choose which channels carry this notice, but at least one stays on.
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : null}
                              </div>
                              {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
                            </div>
                            {channelColumns.map(({ key, label }) => {
                              if (!event.availableChannels[key]) {
                                return <span key={key} className="text-center text-xs text-muted-foreground" aria-label={`${label}: not available for this notice`}>—</span>;
                              }
                              const checked = Boolean(event.channels[key]);
                              const lastRequired = event.mandatory && checked && onChannels.length === 1;
                              const id = `notif-${event.eventKey}-${key}`;
                              return (
                                <label
                                  key={key}
                                  htmlFor={id}
                                  className="matrx-tap-area flex justify-center"
                                  title={
                                    !scopeId
                                      ? "Choose an organization above to change this."
                                      : lastRequired
                                        ? "Required notice: turn another channel on first."
                                        : `${label}, default ${event.defaults[key] ? "on" : "off"}`
                                  }
                                >
                                  <Switch
                                    id={id}
                                    size="sm"
                                    checked={checked}
                                    disabled={!scopeId || savingKey === `${event.eventKey}:${key}` || lastRequired}
                                    onCheckedChange={(enabled: boolean) => handleToggle(event.eventKey, key, enabled)}
                                    aria-label={`${event.label}: ${label}`}
                                  />
                                </label>
                              );
                            })}
                            <div className="flex justify-center">
                              {scopeId && hasOwnRow ? (
                                <ResetTapButton
                                  variant="transparent"
                                  ariaLabel={
                                    showScopePicker
                                      ? `Stop setting ${event.label} separately for ${activeScope?.label ?? "this organization"}`
                                      : `Reset ${event.label} to default`
                                  }
                                  onClick={() =>
                                    handleReset(
                                      event.eventKey,
                                      channelColumns.filter(({ key }) => event.availableChannels[key]).map(({ key }) => key),
                                    )
                                  }
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
