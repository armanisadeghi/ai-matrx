// Canonical Notification System — client half of the preferences contract.
//
// The platform's event registry lives in `communication.notification_event_type`
// (system-org rows, readable by every authenticated user). A user's explicit
// choice per (event, channel) is a row in `communication.notification_preference`;
// ABSENCE of a row means the event's declared default applies (per-event
// defaults are the owner ruling — e.g. CMS form submissions default to email).
// The aidream server reads the same two tables at send time, so this module and
// the server can never disagree.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 A PREFERENCE BELONGS TO ONE ORGANIZATION (hr_l3_116, access ladder T-3).
//
// Everything a person does scopes to an organization, so a switch about an
// organization's events governs THAT organization. Someone in two companies who
// turns "leave decided" off in A still hears it from B.
//
// The server's ladder is nearest-wins:
//
//     the person's row for the EVENT'S organization
//   → the person's most recently updated row for that event in ANY of their
//     organizations
//   → the event's platform default
//
// So `organization_id` on a row is not bookkeeping — it is the row's meaning.
// A write names the organization the person chose (the scope picker, or their
// active organization); with none chosen it HOLDS and asks (`ensureOrgId`).
// ─────────────────────────────────────────────────────────────────────────────
//
// Cross-repo truth: common-docs/projects/notification-system/HANDOFF.md.

import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { getUserOrganizations } from "@/features/organizations/service";

export type NotificationEventTypeRow =
  Database["communication"]["Tables"]["notification_event_type"]["Row"];
export type NotificationPreferenceRow =
  Database["communication"]["Tables"]["notification_preference"]["Row"];

/** Channels the notification spine can deliver. A row exposes a choice only
 * when its registry configuration actually has that channel's template. */
export const NOTIFICATION_CHANNELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "email", label: "Email" },
  { key: "in_app", label: "In-app" },
  { key: "sms", label: "Text message" },
];

/** One place a switch can be set: an organization the person belongs to. */
export interface NotificationScope {
  organizationId: string;
  label: string;
}

export interface NotificationEventSetting {
  eventKey: string;
  label: string;
  description: string | null;
  /** Per channel: the effective on/off in the scope that was loaded. */
  channels: Record<string, boolean>;
  /** Per channel: the platform default declared by the event. */
  defaults: Record<string, boolean>;
  /** Per channel: whether the registry makes a user choice meaningful. */
  availableChannels: Record<string, boolean>;
  /**
   * Per channel: true when this scope has NO row of its own and the value shown
   * came from the person's choice in another organization (or the event
   * default). Flipping such a switch creates this organization's own row.
   */
  inherited: Record<string, boolean>;
}

function asBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(value as Record<string, unknown>)) {
    out[key] = Boolean(flag);
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * The server's registry stores renderable channel templates at
 * `config.templates.<channel>` and its catalog owns `config.sms_locked`.
 * A preference must never render a switch for a channel that cannot render or
 * for a policy-locked SMS channel: such a switch would promise a delivery path
 * the dispatcher must refuse.
 */
export function notificationChannelAvailability(config: unknown): Record<string, boolean> {
  const eventConfig = asRecord(config);
  const templates = asRecord(eventConfig.templates);
  const hasTemplate = (channel: string) => {
    const template = asRecord(templates[channel]);
    return typeof template.body === "string" && template.body.trim().length > 0;
  };

  return {
    email: hasTemplate("email"),
    in_app: hasTemplate("in_app"),
    sms: hasTemplate("sms") && eventConfig.sms_locked !== true,
  };
}

/**
 * The scopes this person can set preferences in — every organization they
 * belong to — and the one to open first: the organization they are working in.
 * With none chosen, `ensureOrgId` holds and asks; nothing is picked for them.
 */
export async function loadNotificationScopes(): Promise<{
  scopes: NotificationScope[];
  initialOrganizationId: string;
}> {
  const [organizations, initialOrganizationId] = await Promise.all([
    getUserOrganizations(),
    ensureOrgId(null),
  ]);
  const scopes: NotificationScope[] = organizations.map((org) => ({
    organizationId: org.id,
    label: org.name,
  }));
  if (!scopes.some((scope) => scope.organizationId === initialOrganizationId)) {
    scopes.unshift({ organizationId: initialOrganizationId, label: "Current organization" });
  }
  return { scopes, initialOrganizationId };
}

/**
 * Load every enabled event with the caller's effective choices IN ONE SCOPE.
 *
 * The read walks the same ladder the server does — this organization's row,
 * then the person's most recently updated row in any organization, then the
 * event default — so what the screen shows is what the send path will decide.
 * Getting that wrong is worse than showing nothing: a switch that displays
 * "off" while the server sends is a lie the person only discovers by receiving
 * the message.
 */
export async function loadNotificationSettings(
  scopeOrganizationId: string,
): Promise<NotificationEventSetting[]> {
  const [{ data: events, error: eventsError }, { data: prefs, error: prefsError }] =
    await Promise.all([
      supabase
        .schema("communication")
        .from("notification_event_type")
        .select("event_key,label,description,default_channels,config,enabled,deleted_at")
        .eq("enabled", true)
        .is("deleted_at", null)
        .order("label"),
      supabase
        .schema("communication")
        .from("notification_preference")
        // `organization_id` is which organization the row governs; `updated_at`
        // picks the most recent choice elsewhere, exactly as the server does.
        .select("event_key,channel,enabled,organization_id,updated_at,deleted_at")
        .is("deleted_at", null),
    ]);
  if (eventsError) throw eventsError;
  if (prefsError) throw prefsError;

  const scoped = new Map<string, boolean>();
  const latestElsewhere = new Map<string, { enabled: boolean; updatedAt: string }>();
  for (const pref of prefs ?? []) {
    const key = `${pref.event_key}:${pref.channel}`;
    if (pref.organization_id === scopeOrganizationId) {
      scoped.set(key, Boolean(pref.enabled));
      continue;
    }
    const seen = latestElsewhere.get(key);
    if (!seen || pref.updated_at > seen.updatedAt) {
      latestElsewhere.set(key, { enabled: Boolean(pref.enabled), updatedAt: pref.updated_at });
    }
  }

  return (events ?? []).flatMap((event) => {
    const defaults = asBooleanMap(event.default_channels);
    const availableChannels = notificationChannelAvailability(event.config);
    if (!NOTIFICATION_CHANNELS.some(({ key }) => availableChannels[key])) return [];
    const channels: Record<string, boolean> = {};
    const inherited: Record<string, boolean> = {};
    for (const { key } of NOTIFICATION_CHANNELS) {
      const mapKey = `${event.event_key}:${key}`;
      const own = scoped.get(mapKey);
      inherited[key] = own === undefined;
      channels[key] = own ?? latestElsewhere.get(mapKey)?.enabled ?? Boolean(defaults[key]);
    }
    return [{
      eventKey: event.event_key,
      label: event.label,
      description: event.description,
      channels,
      defaults,
      availableChannels,
      inherited,
    }];
  });
}

/**
 * Record the caller's explicit choice for one (event, channel) IN ONE
 * ORGANIZATION. `organizationId` omitted means the organization the person is
 * working in; with none chosen, `ensureOrgId` holds and asks.
 */
export async function setNotificationPreference(
  eventKey: string,
  channel: string,
  enabled: boolean,
  organizationId?: string | null,
): Promise<void> {
  const [{ data: auth, error: authError }, scopeOrganizationId] = await Promise.all([
    getClaimsUser(supabase),
    ensureOrgId(organizationId),
  ]);
  if (authError) throw authError;
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in to change notification preferences.");

  const { error } = await supabase
    .schema("communication")
    .from("notification_preference")
    .upsert(
      {
        user_id: userId,
        event_key: eventKey,
        channel,
        enabled,
        organization_id: scopeOrganizationId,
        created_by: userId,
        deleted_at: null,
      },
      // Must name the organization: the unique key is
      // (user_id, organization_id, event_key, channel) (hr_l3_116), and an
      // on_conflict target that does not match a unique index is rejected outright.
      { onConflict: "user_id,organization_id,event_key,channel" },
    );
  if (error) throw error;
}

/**
 * Drop this organization's own row so the switch goes back to following the
 * person's choice elsewhere (or the event default).
 *
 * Without this the organization view is a one-way door: once a switch is touched, the
 * row pins that value forever and "same as my default" becomes unsayable — which
 * is the difference between an override and a fork.
 */
export async function clearNotificationPreference(
  eventKey: string,
  channel: string,
  organizationId: string,
): Promise<void> {
  const { data: auth, error: authError } = await getClaimsUser(supabase);
  if (authError) throw authError;
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in to change notification preferences.");

  const { error } = await supabase
    .schema("communication")
    .from("notification_preference")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("event_key", eventKey)
    .eq("channel", channel)
    .is("deleted_at", null);
  if (error) throw error;
}
