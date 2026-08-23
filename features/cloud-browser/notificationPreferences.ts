/**
 * D-14 notification preferences — read and written on the CANONICAL tables.
 *
 * 🚨 These four switches used to live in `browser.profile.metadata` JSONB, a
 * per-profile blob nothing else in the platform reads. That is a parallel
 * preference store: the user's answer to "email me" sat somewhere the email
 * sender would never look, per BROWSER rather than per person, and invisible to
 * every other surface that manages notifications. NOTIFICATIONS.md §5 names the
 * real homes, and this module is the seam onto them:
 *
 * | Channel   | Canonical home                                                        |
 * |-----------|-----------------------------------------------------------------------|
 * | in-app    | none — the assist is NOT a preference (§2). Always on, always shown.  |
 * | browser   | `users.user_preferences` → `messaging.showDesktopNotifications`,      |
 * |           | reached through `useSetting` (see `useHandoffNotificationPreferences`)|
 * | email     | `users.user_email_preferences.browser_handoff_notifications`          |
 * | text      | `communication.sms_notification_preferences.system_alerts`            |
 *
 * This file owns the two DB-backed halves. The desktop half is a Redux-synced
 * setting and is composed in the hook, because writing that blob behind Redux's
 * back would desync the store that owns it.
 *
 * The server reads the exact same three places
 * (aidream `services/cloud_browser/notify.py::resolve_handoff_notification_consent`).
 */

import { supabase } from "@/utils/supabase/client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

export interface HandoffChannelPreferences {
  /** Opt-in. `users.user_email_preferences.browser_handoff_notifications`. */
  email: boolean;
  /** Opt-in AND enrolment-gated. `sms_notification_preferences.system_alerts`. */
  sms: boolean;
  /**
   * Whether a verified, enrolled number exists at all. `false` means the text
   * switch cannot be turned on here — the person goes through the shipped SMS
   * enrolment flow first, which owns verification and the consent record.
   */
  smsEnrolled: boolean;
}

export const NO_HANDOFF_CHANNELS: HandoffChannelPreferences = {
  email: false,
  sms: false,
  smsEnrolled: false,
};

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Read both DB-backed channels for the signed-in person. */
export async function loadHandoffChannelPreferences(): Promise<HandoffChannelPreferences> {
  const userId = await currentUserId();
  if (!userId) return NO_HANDOFF_CHANNELS;

  const [email, sms] = await Promise.all([
    supabase
      .schema("users")
      .from("user_email_preferences")
      .select("browser_handoff_notifications")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .schema("communication")
      .from("sms_notification_preferences")
      .select("system_alerts, sms_enabled")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (email.error) throw email.error;
  if (sms.error) throw sms.error;

  const smsEnrolled = sms.data?.sms_enabled === true;
  return {
    email: email.data?.browser_handoff_notifications === true,
    // An un-enrolled number is not a channel, whatever the family flag says.
    sms: smsEnrolled && sms.data?.system_alerts === true,
    smsEnrolled,
  };
}

/** Turn the email channel on or off. Creates the person's preference row if
 *  they have never had one — a missing row is "never asked", not "opted out
 *  forever". */
export async function setHandoffEmailPreference(enabled: boolean): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to change how we reach you.");

  const existing = await supabase
    .schema("users")
    .from("user_email_preferences")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const { error } = await supabase
      .schema("users")
      .from("user_email_preferences")
      .update({ browser_handoff_notifications: enabled })
      .eq("id", existing.data.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .schema("users")
    .from("user_email_preferences")
    .insert({
      user_id: userId,
      created_by: userId,
      // Never insert an org-scoped row with a null org (the column is NOT NULL
      // and NULL is never "global" — it is a row nobody can see).
      organization_id: await ensureOrgId(null),
      browser_handoff_notifications: enabled,
    });
  if (error) throw error;
}

/**
 * Turn the text channel on or off.
 *
 * 🚨 Only ever flips the `system_alerts` FAMILY on an already-enrolled row.
 * Verification, the `communication.sms_consent` opt-in and the A2P program
 * binding are owned by the shipped enrolment flow
 * (`features/sms/components/SmsEnrollmentSettingsSection`) and are never
 * written from here — a bespoke surface minting SMS consent is how a
 * compliance record ends up meaning nothing.
 */
export async function setHandoffSmsPreference(enabled: boolean): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in to change how we reach you.");

  const existing = await supabase
    .schema("communication")
    .from("sms_notification_preferences")
    .select("id, sms_enabled")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (!existing.data || existing.data.sms_enabled !== true) {
    throw new Error(
      "Verify a mobile number in Settings → Text messages before turning this on.",
    );
  }

  const { error } = await supabase
    .schema("communication")
    .from("sms_notification_preferences")
    .update({ system_alerts: enabled })
    .eq("id", existing.data.id);
  if (error) throw error;
}
