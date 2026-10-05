import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getStripe, type StripeMode } from "@/lib/stripe/server";
import { withCheckoutLease } from "@/features/entitlements/stripe/checkoutLease";
import { sendEmail } from "@/lib/email/client";

export type AccountClosureState = "closing" | "closed" | "failed" | "restored";

export interface AccountClosureJournal {
  requestId: string;
  state: AccountClosureState;
  requestedAt: string;
  email: string;
  checkpoints: Record<string, string>;
  receipts: Record<string, string[]>;
  recoveryTokenHash?: string;
  errors: string[];
}

type Metadata = Record<string, unknown>;

export class AccountClosureError extends Error {
  constructor(message: string, readonly status = 400, readonly blockers: string[] = []) {
    super(message);
  }
}

function isRecord(value: unknown): value is Metadata {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function readClosureJournal(metadata: unknown): AccountClosureJournal | null {
  if (!isRecord(metadata) || !isRecord(metadata.account_closure)) return null;
  const closure = metadata.account_closure;
  if (
    typeof closure.requestId !== "string" ||
    !["closing", "closed", "failed", "restored"].includes(String(closure.state)) ||
    typeof closure.requestedAt !== "string" ||
    typeof closure.email !== "string"
  ) return null;
  return {
    requestId: closure.requestId,
    state: closure.state as AccountClosureState,
    requestedAt: closure.requestedAt,
    email: closure.email,
    checkpoints: isRecord(closure.checkpoints) ? Object.entries(closure.checkpoints).reduce<Record<string, string>>((result, [key, value]) => {
      if (typeof value === "string") result[key] = value;
      return result;
    }, {}) : {},
    receipts: isRecord(closure.receipts) ? Object.fromEntries(Object.entries(closure.receipts).map(([k, v]) => [k, Array.isArray(v) ? v.filter((id): id is string => typeof id === "string") : []])) : {},
    recoveryTokenHash: typeof closure.recoveryTokenHash === "string" ? closure.recoveryTokenHash : undefined,
    errors: Array.isArray(closure.errors) ? closure.errors.filter((v): v is string => typeof v === "string") : [],
  };
}

export function recoveryToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export function recoveryTokenMatches(token: string, expectedHash?: string): boolean {
  if (!expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type LeasedJournal = AccountClosureJournal & { lease?: { token: string; expires_at: string } };

async function writeJournal(userId: string, token: string, journal: AccountClosureJournal) {
  const { data, error } = await createAdminClient().rpc("account_closure_write", {
    p_user_id: userId, p_token: token, p_journal: journal,
  });
  if (error) throw error;
  if (!data) throw new AccountClosureError("Account closure is being processed elsewhere. Try again shortly.", 409);
}

async function claimJournal(userId: string, initial: AccountClosureJournal): Promise<{ token: string; journal: AccountClosureJournal }> {
  const token = randomUUID();
  const { data, error } = await createAdminClient().rpc("account_closure_claim", {
    p_user_id: userId, p_token: token, p_initial_journal: initial,
  });
  if (error) throw error;
  if (!isRecord(data)) throw new AccountClosureError("Account closure is already being processed. Try again shortly.", 409);
  const journal = readClosureJournal({ account_closure: data } as Metadata);
  if (!journal) throw new AccountClosureError("Account closure record is invalid.", 500);
  return { token, journal };
}

async function releaseJournal(userId: string, token: string) {
  const { error } = await createAdminClient().rpc("account_closure_release", { p_user_id: userId, p_token: token });
  if (error) console.error("[account-closure] lease release failed", error);
}

async function soleOwnedOrganizations(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const owned = new Set<string>();
  for (let start = 0; ; start += 200) {
    const { data, error } = await admin.schema("iam").from("memberships")
      .select("organization_id").eq("user_id", userId).eq("container_type", "organization")
      .eq("status", "active").is("deleted_at", null).eq("role", "owner").range(start, start + 199);
    if (error) throw error;
    for (const row of data ?? []) owned.add(row.organization_id);
    if (!data || data.length < 200) break;
  }
  const blockers: string[] = [];
  for (const organizationId of owned) {
    const { count: memberCount, error: memberCountError } = await admin.schema("iam").from("memberships")
      .select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId)
      .eq("container_type", "organization").eq("status", "active").is("deleted_at", null);
    if (memberCountError) throw memberCountError;
    if ((memberCount ?? 0) <= 1) continue;
    const { count, error: countError } = await admin.schema("iam").from("memberships")
      .select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId)
      .eq("container_type", "organization").eq("status", "active").is("deleted_at", null)
      .eq("role", "owner").neq("user_id", userId);
    if (countError) throw countError;
    // A personal one-member organization is retained. A shared organization
    // may close only after another active owner exists.
    if ((count ?? 0) === 0) blockers.push(organizationId);
  }
  return blockers;
}

export function isPersonalPlatformSubscription(subscription: Stripe.Subscription, userId: string): boolean {
  return subscription.metadata.beneficiary_user_id === userId && subscription.items.data.length > 0
    && subscription.items.data.every((item) => item.price.metadata?.purpose === "platform_subscription");
}

async function cancelPersonalSubscriptions(userId: string, journal: AccountClosureJournal, closureToken: string) {
  const admin = createAdminClient();
  const { data: customers, error } = await admin.schema("billing").from("customer")
    .select("stripe_customer_id, livemode, beneficiary_user_id")
    .eq("beneficiary_user_id", userId);
  if (error) throw error;
  for (const customer of customers ?? []) {
    if (!customer.stripe_customer_id || typeof customer.livemode !== "boolean") continue;
    const mode: StripeMode = customer.livemode ? "live" : "test";
    const receiptKey = `billing:${mode}:${customer.stripe_customer_id}`;
    if (journal.checkpoints[receiptKey]) continue;
    await withCheckoutLease(customer.stripe_customer_id, customer.livemode, async (assertHeld) => {
      await writeJournal(userId, closureToken, journal);
      const stripe = getStripe(mode);
      const stripeCustomer = await stripe.customers.retrieve(customer.stripe_customer_id);
      if (stripeCustomer.deleted || stripeCustomer.metadata.beneficiary_user_id !== userId) {
        throw new AccountClosureError("Personal billing identity could not be verified.", 409);
      }
      const subscriptions: Stripe.Subscription[] = [];
      for await (const subscription of stripe.subscriptions.list({ customer: customer.stripe_customer_id, status: "all", limit: 100 })) subscriptions.push(subscription);
      const receipts: string[] = [];
      for (const subscription of subscriptions) {
        if (!isPersonalPlatformSubscription(subscription, userId)) continue;
        const { data: mirror, error: mirrorError } = await admin.schema("billing").from("subscription")
          .select("beneficiary_user_id, stripe_subscription_id").eq("livemode", customer.livemode)
          .eq("stripe_subscription_id", subscription.id).eq("beneficiary_user_id", userId).maybeSingle();
        if (mirrorError) throw mirrorError;
        if (!mirror) throw new AccountClosureError("Personal subscription could not be verified in the billing ledger.", 409);
        if (["canceled", "incomplete_expired"].includes(subscription.status)) { receipts.push(subscription.id); continue; }
        await writeJournal(userId, closureToken, journal);
        await assertHeld();
        await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
        const checked = await stripe.subscriptions.retrieve(subscription.id);
        if (!isPersonalPlatformSubscription(checked, userId) || checked.status !== "canceled") throw new AccountClosureError("Personal subscription cancellation was not confirmed.", 502);
        receipts.push(subscription.id);
        journal.receipts[receiptKey] = receipts;
        await writeJournal(userId, closureToken, journal);
      }
      journal.receipts[receiptKey] = receipts;
      journal.checkpoints[receiptKey] = new Date().toISOString();
    });
  }
}

function recoveryEmail(link: string) {
  return {
    subject: "Your AI Matrx account recovery link",
    html: `<p>Your account closure can be reversed with this link:</p><p><a href="${link}">Restore account</a></p><p>Personal subscriptions remain canceled after restoration.</p>`,
  };
}

/** Starts a reversible archive-only closure. It never deletes users or retained data. */
export async function closeAccount(input: { userId: string; email: string; metadata: unknown; origin: string; accessToken: string }) {
  const existing = readClosureJournal(input.metadata);
  if (existing?.state === "closed") return { journal: existing, alreadyClosed: true };
  const blockers = await soleOwnedOrganizations(input.userId);
  if (blockers.length) throw new AccountClosureError("Transfer ownership of each organization before closing your account.", 409, blockers);
  if (!input.accessToken) throw new AccountClosureError("Sign in again before closing your account.", 401);
  // A restored closure is a new closure request. Old receipts and recovery material
  // are deliberately not reused: the user may have changed billing in between.
  const token = recoveryToken();
  const initial: AccountClosureJournal = existing?.state === "restored"
    ? { requestId: randomBytes(16).toString("hex"), state: "closing", requestedAt: new Date().toISOString(), email: input.email, checkpoints: {}, receipts: {}, errors: [] }
    : existing ?? { requestId: randomBytes(16).toString("hex"), state: "closing", requestedAt: new Date().toISOString(), email: input.email, checkpoints: {}, receipts: {}, errors: [] };
  const claimed = await claimJournal(input.userId, initial);
  const journal = claimed.journal;
  try {
    if (!journal.checkpoints.recovery_email_sent) {
      const link = `${input.origin}/account/restore?request=${encodeURIComponent(journal.requestId)}&user=${encodeURIComponent(input.userId)}&token=${encodeURIComponent(token.token)}`;
      const mailed = await sendEmail({ to: input.email, ...recoveryEmail(link) });
      if (!mailed.success) throw new AccountClosureError("We could not send your recovery email. Nothing was changed.", 502);
      journal.recoveryTokenHash = token.hash;
      journal.checkpoints.recovery_email_sent = new Date().toISOString();
      await writeJournal(input.userId, claimed.token, journal);
    }
    await cancelPersonalSubscriptions(input.userId, journal, claimed.token);
    journal.checkpoints.billing_stopped = new Date().toISOString();
    // Persist the recovery path before disabling access. If Auth's final ban
    // state races with a later journal write, recovery can still safely unban.
    journal.checkpoints.access_disable_started = new Date().toISOString();
    await writeJournal(input.userId, claimed.token, journal);
    const admin = createAdminClient();
    // GoTrue's administrative signOut endpoint revokes the refresh-token family
    // represented by this freshly authenticated user's access JWT, never a user id.
    const revoked = await admin.auth.admin.signOut(input.accessToken, "global");
    if (revoked.error) throw revoked.error;
    const banned = await admin.auth.admin.updateUserById(input.userId, { ban_duration: "876000h" });
    if (banned.error) throw banned.error;
    journal.state = "closed";
    journal.checkpoints.access_disabled = new Date().toISOString();
    try {
      await writeJournal(input.userId, claimed.token, journal);
    } catch (writeError) {
      // A ban without its durable recovery state would strand the account.
      const compensation = await admin.auth.admin.updateUserById(input.userId, { ban_duration: "none" });
      if (!compensation.error) delete journal.checkpoints.access_disabled;
      throw writeError;
    }
    return { journal, alreadyClosed: false };
  } catch (error) {
    journal.state = "failed";
    journal.errors.push(error instanceof Error ? error.message : "Account closure failed");
    await writeJournal(input.userId, claimed.token, journal);
    throw error;
  } finally {
    await releaseJournal(input.userId, claimed.token);
  }
}

export async function restoreAccount(input: { userId: string; requestId: string; token: string }) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(input.userId);
  if (error || !data.user) throw new AccountClosureError("Recovery link is invalid.", 404);
  const journal = readClosureJournal(data.user.app_metadata);
  const isRecoverable = journal?.state === "closed" || (journal?.state === "failed" && !!journal.checkpoints.access_disable_started);
  if (!journal || journal.requestId !== input.requestId || !isRecoverable || !recoveryTokenMatches(input.token, journal.recoveryTokenHash)) {
    throw new AccountClosureError("Recovery link is invalid or has already been used.", 400);
  }
  const claimed = await claimJournal(input.userId, journal);
  const claimedRecoverable = claimed.journal.state === "closed" || (claimed.journal.state === "failed" && !!claimed.journal.checkpoints.access_disable_started);
  if (claimed.journal.requestId !== input.requestId || !claimedRecoverable) throw new AccountClosureError("Recovery link is invalid or has already been used.", 400);
  try {
    const working = claimed.journal;
    if (!recoveryTokenMatches(input.token, working.recoveryTokenHash)) throw new AccountClosureError("Recovery link is invalid or has already been used.", 400);
    if (!working.checkpoints.recovery_unbanned) {
      const unbanned = await admin.auth.admin.updateUserById(input.userId, { ban_duration: "none" });
      if (unbanned.error) throw unbanned.error;
      working.checkpoints.recovery_unbanned = new Date().toISOString();
      await writeJournal(input.userId, claimed.token, working);
    }
    // Link generation may fail after unbanning. Keeping the token hash until a
    // link exists makes the recovery request safely retryable.
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: working.email });
    if (generated.error || !generated.data.properties?.action_link) throw new AccountClosureError("Your account was restored, but a sign-in link could not be created.", 502);
    working.state = "restored";
    working.checkpoints.restored = new Date().toISOString();
    working.checkpoints.recovery_magic_link_issued = new Date().toISOString();
    delete working.recoveryTokenHash;
    await writeJournal(input.userId, claimed.token, working);
    return { actionLink: generated.data.properties.action_link };
  } finally {
    await releaseJournal(input.userId, claimed.token);
  }
}
