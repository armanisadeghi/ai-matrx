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
// Cross-repo truth: common-docs/projects/notification-system/HANDOFF.md.

import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";

export type NotificationEventTypeRow =
  Database["communication"]["Tables"]["notification_event_type"]["Row"];
export type NotificationPreferenceRow =
  Database["communication"]["Tables"]["notification_preference"]["Row"];

/** Channels the platform can deliver today. New channels are a registration in
 * aidream (services/notifications/channels/) plus a label here. */
export const NOTIFICATION_CHANNELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "email", label: "Email" },
];

export interface NotificationEventSetting {
  eventKey: string;
  label: string;
  description: string | null;
  /** Per channel: the effective on/off after applying the user's explicit rows
   * over the event's defaults. */
  channels: Record<string, boolean>;
  /** Per channel: the platform default declared by the event. */
  defaults: Record<string, boolean>;
}

function asBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(value as Record<string, unknown>)) {
    out[key] = Boolean(flag);
  }
  return out;
}

/** Load every enabled event with the caller's effective per-channel choices. */
export async function loadNotificationSettings(): Promise<NotificationEventSetting[]> {
  const [{ data: events, error: eventsError }, { data: prefs, error: prefsError }] =
    await Promise.all([
      supabase
        .schema("communication")
        .from("notification_event_type")
        .select("event_key,label,description,default_channels,enabled,deleted_at")
        .eq("enabled", true)
        .is("deleted_at", null)
        .order("label"),
      supabase
        .schema("communication")
        .from("notification_preference")
        .select("event_key,channel,enabled,deleted_at")
        .is("deleted_at", null),
    ]);
  if (eventsError) throw eventsError;
  if (prefsError) throw prefsError;

  const overrides = new Map<string, boolean>();
  for (const pref of prefs ?? []) {
    overrides.set(`${pref.event_key}:${pref.channel}`, Boolean(pref.enabled));
  }

  return (events ?? []).map((event) => {
    const defaults = asBooleanMap(event.default_channels);
    const channels: Record<string, boolean> = {};
    for (const { key } of NOTIFICATION_CHANNELS) {
      const override = overrides.get(`${event.event_key}:${key}`);
      channels[key] = override ?? Boolean(defaults[key]);
    }
    return {
      eventKey: event.event_key,
      label: event.label,
      description: event.description,
      channels,
      defaults,
    };
  });
}

/** Record the caller's explicit choice for one (event, channel). */
export async function setNotificationPreference(
  eventKey: string,
  channel: string,
  enabled: boolean,
): Promise<void> {
  const [{ data: auth, error: authError }, organizationId] = await Promise.all([
    supabase.auth.getUser(),
    resolvePersonalOrgId(),
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
        organization_id: organizationId,
        created_by: userId,
        deleted_at: null,
      },
      { onConflict: "user_id,event_key,channel" },
    );
  if (error) throw error;
}
