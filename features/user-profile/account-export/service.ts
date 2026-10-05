import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";

/** An explicit personal-account export, not an organization/content backup. */
export async function exportPersonalAccount(
  client: ReturnType<typeof createClient> = createClient(),
  now = new Date(),
) {
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) throw new Error("Sign in to download account data.");
  const user = identity.user;
  const snapshotAt = now.toISOString();
  const [profile, contactProfile, preferences, subscriptions, usage] = await Promise.all([
    readAllRows(({ from, to }) => client.schema("users").from("profiles")
      .select("id, display_name, avatar_url, status_text, created_at", { count: "exact" })
      .eq("id", user.id).order("id").range(from, to), { label: "Account profile" }),
    readAllRows(({ from, to }) => client.schema("users").from("user_form_profile")
      .select("user_id, legal_first_name, legal_middle_name, legal_last_name, preferred_name, name_suffix, pronouns, date_of_birth, company_name, job_title, website_url, emails, phones, social_handles, emergency_contacts, images, shipping_line1, shipping_line2, shipping_city, shipping_region, shipping_postal_code, shipping_country, billing_line1, billing_line2, billing_city, billing_region, billing_postal_code, billing_country, billing_same_as_shipping, created_at", { count: "exact" })
      .eq("user_id", user.id).order("user_id").range(from, to), { label: "Contact profile" }),
    readAllRows(({ from, to }) => client.schema("users").from("user_preferences")
      .select("id, preferences, auto_rag_enabled, created_at", { count: "exact" })
      .eq("user_id", user.id).order("id").range(from, to), { label: "Account preferences" }),
    readAllRows(({ from, to }) => client.schema("billing").from("subscription")
      .select("id, plan_key, tier, status, livemode, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_start, trial_end, created_at", { count: "exact" })
      .eq("beneficiary_user_id", user.id).lte("created_at", snapshotAt)
      .order("id").range(from, to), { label: "Personal subscriptions" }),
    readAllRows(({ from, to }) => client.schema("billing").from("usage_ledger")
      .select("id, created_at, quantity, capability", { count: "exact" })
      .eq("created_by", user.id).eq("capability", "platform.points").is("deleted_at", null)
      .lte("created_at", snapshotAt).order("id").range(from, to), { label: "Personal usage" }),
  ]);
  // Do not emit a successful archive after any failed/truncated dataset read.
  return {
    manifest: {
      format: "ai-matrx.personal-account",
      version: 1,
      exportedAt: snapshotAt,
      userId: user.id,
      counts: { profile: profile.length, contactProfile: contactProfile.length, preferences: preferences.length, subscriptions: subscriptions.length, usage: usage.length },
      excluded: ["Company and shared records", "Projects, conversations, notes and files", "Vault and authentication credentials", "Payment credentials", "Operational logs and backups"],
      consistency: "Records created after exportedAt are excluded from billing and usage; mutable profile/settings reflect their read time.",
    },
    identity: { id: user.id, email: user.email ?? null, createdAt: user.created_at, emailConfirmedAt: user.email_confirmed_at ?? null },
    profile,
    contactProfile,
    preferences,
    subscriptions,
    usage,
  };
}
