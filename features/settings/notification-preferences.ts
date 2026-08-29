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
// 🚨 A PREFERENCE IS PER EMPLOYER (hr_l3_116, Arman's 2026-08-29 doctrine).
//
// Everything an org-signed-up person does in a business context scopes to that
// organization, so a switch about an employer's events governs THAT EMPLOYER.
// Someone employed by two companies who turns "leave decided" off used to
// silence both with one switch and had no way to say "not from A, still from B".
//
// The server's ladder is nearest-wins:
//
//     the user's row for THIS employer
//   → the user's row on their own PERSONAL organization  (their default everywhere)
//   → the organization's override
//   → the event's platform default
//
// So `organization_id` on a row is not bookkeeping — it is the row's meaning.
// A row on the personal organization is the cross-org default; a row on any
// other organization governs that employer only. (It is the personal org and not
// `NULL` because NULL organizations are banned platform-wide and the ban is
// enforced by release-blocking ratchets; see hr_l3_116 §1.)
//
// WHAT THIS SURFACE SHOWS. A person with fewer than two employers sees exactly
// what they saw before — one set of switches, writing their personal-organization
// row, which the ladder applies everywhere. The employer selector appears only for
// the multi-employer population the ruling is about, because that is the only
// population for whom the distinction is real.
// ─────────────────────────────────────────────────────────────────────────────
//
// Cross-repo truth: common-docs/projects/notification-system/HANDOFF.md.

import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { resolvePersonalOrgId } from "@/lib/organizations/personalOrg";
import { fetchHrContext } from "@/features/hr/service";
import { isHrGranted } from "@/features/hr/types";

export type NotificationEventTypeRow =
  Database["communication"]["Tables"]["notification_event_type"]["Row"];
export type NotificationPreferenceRow =
  Database["communication"]["Tables"]["notification_preference"]["Row"];

/** Channels the platform can deliver today. New channels are a registration in
 * aidream (services/notifications/channels/) plus a label here. */
export const NOTIFICATION_CHANNELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "email", label: "Email" },
];

/**
 * One place a switch can be set. `isGlobal` marks the person's own organization —
 * the row the ladder falls back to in every employer that has no row of its own.
 */
export interface NotificationScope {
  organizationId: string;
  label: string;
  isGlobal: boolean;
}

export interface NotificationEventSetting {
  eventKey: string;
  label: string;
  description: string | null;
  /** Per channel: the effective on/off in the scope that was loaded. */
  channels: Record<string, boolean>;
  /** Per channel: the platform default declared by the event. */
  defaults: Record<string, boolean>;
  /**
   * Per channel: true when this scope has NO row of its own and the value shown
   * came from the person's cross-org default (or the event default). Flipping
   * such a switch creates the employer's own row.
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

/**
 * The scopes this person can set preferences in: always their own default, plus
 * one entry per employer they can do HR in.
 *
 * 🚨 This is NOT a cross-employer HR view — `features/hr/shared/useHrContext.ts`
 * rightly forbids merging employers' HR data into one screen. Nothing here reads
 * an employer's data; it reads the LIST of employers so a person can be asked
 * which one a notification switch is about. Asking is the whole point: a switch
 * that silently governs an unnamed set of employers is the defect being fixed.
 */
export async function loadNotificationScopes(): Promise<NotificationScope[]> {
  const [personalOrgId, hrContext] = await Promise.all([
    resolvePersonalOrgId(),
    // The door-aligned wrapper, not a raw `.rpc()`: `fetchHrContext` is the ONE
    // caller of `hr_my_context` and carries the verified wire alignment.
    fetchHrContext(),
  ]);

  const scopes: NotificationScope[] = [
    { organizationId: personalOrgId, label: "Everywhere (my default)", isGlobal: true },
  ];

  // A denied or failed HR door is NOT an error here: a person with no HR at all
  // still has notification preferences, and they get the default-everywhere
  // screen. Only the employer picker depends on this call.
  if (isHrGranted(hrContext)) {
    for (const employer of hrContext.data.employers ?? []) {
      // The personal organization is never an employer, but if it ever appeared it
      // would collide with the global scope and silently shadow it.
      if (!employer.organization_id || employer.organization_id === personalOrgId) continue;
      scopes.push({
        organizationId: employer.organization_id,
        label: employer.name || "Employer",
        isGlobal: false,
      });
    }
  }
  return scopes;
}

/**
 * Load every enabled event with the caller's effective choices IN ONE SCOPE.
 *
 * The read walks the same ladder the server does — employer row, then the
 * personal-organization row, then the event default — so what the screen shows is
 * what the send path will decide. Getting that wrong is worse than showing
 * nothing: a switch that displays "off" while the server sends is a lie the person
 * only discovers by receiving the message.
 */
export async function loadNotificationSettings(
  scopeOrganizationId?: string | null,
): Promise<NotificationEventSetting[]> {
  const [personalOrgId, { data: events, error: eventsError }, { data: prefs, error: prefsError }] =
    await Promise.all([
      resolvePersonalOrgId(),
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
        // `organization_id` is which employer the row governs — selecting it is not
        // optional now that more than one row per (event, channel) can exist.
        .select("event_key,channel,enabled,organization_id,deleted_at")
        .is("deleted_at", null),
    ]);
  if (eventsError) throw eventsError;
  if (prefsError) throw prefsError;

  const scopeId = scopeOrganizationId ?? personalOrgId;
  const scoped = new Map<string, boolean>();
  const global = new Map<string, boolean>();
  for (const pref of prefs ?? []) {
    const key = `${pref.event_key}:${pref.channel}`;
    if (pref.organization_id === scopeId) scoped.set(key, Boolean(pref.enabled));
    if (pref.organization_id === personalOrgId) global.set(key, Boolean(pref.enabled));
  }

  return (events ?? []).map((event) => {
    const defaults = asBooleanMap(event.default_channels);
    const channels: Record<string, boolean> = {};
    const inherited: Record<string, boolean> = {};
    for (const { key } of NOTIFICATION_CHANNELS) {
      const mapKey = `${event.event_key}:${key}`;
      const own = scoped.get(mapKey);
      inherited[key] = own === undefined;
      channels[key] = own ?? global.get(mapKey) ?? Boolean(defaults[key]);
    }
    return {
      eventKey: event.event_key,
      label: event.label,
      description: event.description,
      channels,
      defaults,
      inherited,
    };
  });
}

/**
 * Record the caller's explicit choice for one (event, channel) IN ONE SCOPE.
 *
 * `organizationId` omitted means the person's own default everywhere — the
 * personal organization, which is what this surface has always written and what
 * `public._stamp_org_default` fills in for any writer that names no organization.
 */
export async function setNotificationPreference(
  eventKey: string,
  channel: string,
  enabled: boolean,
  organizationId?: string | null,
): Promise<void> {
  const [{ data: auth, error: authError }, personalOrgId] = await Promise.all([
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
        organization_id: organizationId ?? personalOrgId,
        created_by: userId,
        deleted_at: null,
      },
      // Must name the organization: the unique key became
      // (user_id, organization_id, event_key, channel) in hr_l3_116, and an
      // on_conflict target that does not match a unique index is rejected outright.
      { onConflict: "user_id,organization_id,event_key,channel" },
    );
  if (error) throw error;
}

/**
 * Drop this employer's own row so the switch goes back to inheriting the person's
 * default everywhere.
 *
 * Without this the employer view is a one-way door: once a switch is touched, the
 * row pins that value forever and "same as my default" becomes unsayable — which
 * is the difference between an override and a fork.
 */
export async function clearNotificationPreference(
  eventKey: string,
  channel: string,
  organizationId: string,
): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
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
