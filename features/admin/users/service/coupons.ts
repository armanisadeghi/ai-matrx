
// Free time & coupons — the admin tab's data doors. Reads go straight to billing.coupon (super
// admins read every row through platform_admin_read); every write is a gated SECURITY DEFINER
// RPC (billing.coupon_create / coupon_revoke / coupon_mark_sent / free_months_apply). Sends reuse
// the platform's own paths: in-app DM (/api/messages), admin email (/api/admin/email, super
// admin), SMS (/api/sms/send → sendAndLogSms, which honours opt-outs and the off-production
// loopback guard).

import { createClient } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";
import {
  couponDmKey,
  knobNumber,
  parseFreeMonthsApply,
  type CouponKind,
  type CouponRecipient,
  type CouponRow,
  type CouponSent,
  type CreatedCoupon,
  type SendChannel,
} from "../lib/coupons";

export interface FreeTimeKnobs {
  maxMonths: number;
  batchMax: number;
}

export async function fetchFreeTimeKnobs(): Promise<FreeTimeKnobs> {
  const values = await fetchFeatureKnobValues("billing");
  const maxMonths = knobNumber(values.free_period_max_months);
  const batchMax = knobNumber(values.coupon_batch_max);
  if (maxMonths === null || batchMax === null) {
    throw new Error("billing/free_period_max_months or billing/coupon_batch_max has no value");
  }
  return { maxMonths, batchMax };
}

export async function fetchCoupons(): Promise<CouponRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("billing")
    .from("coupon")
    .select(
      "id, code, kind, plan_key, months, max_redemptions, redeemed_count, expires_at, recipient_user_id, recipient_email, recipient_phone, note, revoked_at, created_by, created_at, metadata, coupon_redemption(redeemer_user_id, redeemed_at, status)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const meta = (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {}) as Record<string, Json | undefined>;
    const sent = Array.isArray(meta.sent) ? (meta.sent as unknown as CouponSent[]) : [];
    return {
      id: row.id,
      code: row.code,
      kind: row.kind as CouponKind,
      plan_key: row.plan_key,
      months: row.months,
      max_redemptions: row.max_redemptions,
      redeemed_count: row.redeemed_count,
      expires_at: row.expires_at,
      recipient_user_id: row.recipient_user_id,
      recipient_email: row.recipient_email,
      recipient_phone: row.recipient_phone,
      note: row.note,
      revoked_at: row.revoked_at,
      created_by: row.created_by,
      created_at: row.created_at,
      sent,
      redemptions: (row.coupon_redemption ?? []).filter((r) => r.status !== "released"),
    } satisfies CouponRow;
  });
}

function dbError(error: { message: string; details?: string | null }): Error {
  return new Error(error.details?.trim() || error.message);
}

export async function createCoupons(input: {
  kind: CouponKind;
  planKey: string;
  months: number;
  count: number;
  recipients: CouponRecipient[];
  expiresAt: string | null;
  note: string | null;
}): Promise<CreatedCoupon[]> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("billing").rpc("coupon_create", {
    p_kind: input.kind,
    p_plan_key: input.planKey,
    p_months: input.months,
    p_count: input.count,
    // NULL means "make p_count unaddressed coupons"; the generator renders it non-nullable.
    p_recipients: (input.recipients.length > 0 ? input.recipients : null) as unknown as Json,
    p_expires_at: input.expiresAt as string,
    p_note: input.note as string,
  });
  if (error) throw dbError(error);
  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind as CouponKind,
    plan_key: r.plan_key,
    months: r.months,
    expires_at: r.expires_at,
    recipient_user_id: r.recipient_user_id,
    recipient_email: r.recipient_email,
    recipient_phone: r.recipient_phone,
    link_path: r.link_path,
  }));
}

export async function revokeCoupon(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.schema("billing").rpc("coupon_revoke", { p_id: id });
  if (error) throw dbError(error);
}

export async function markCouponSent(id: string, channel: SendChannel, address: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("billing")
    .rpc("coupon_mark_sent", { p_id: id, p_channel: channel, p_address: address as string });
  if (error) throw dbError(error);
}

export async function applyFreeMonths(input: {
  userIds: string[];
  planKey: string;
  months: number;
  note: string | null;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.schema("billing").rpc("free_months_apply", {
    p_users: input.userIds,
    p_plan: input.planKey,
    p_months: input.months,
    p_note: input.note as string,
  });
  if (error) throw dbError(error);
  return parseFreeMonthsApply(data);
}

// ── Sends ────────────────────────────────────────────────────────────────────

/** In-app direct message: find/create the direct conversation, then send (replay-safe key). */
export async function sendDirectMessage(input: {
  userId: string;
  content: string;
  organizationId: string;
  replayKey: (conversationId: string, content: string) => Promise<string>;
}): Promise<{ conversationId: string }> {
  const convRes = await fetch("/api/messages/conversations", {
    method: "POST",
    headers: applyOrganizationContextHeader({ "Content-Type": "application/json" }, input.organizationId),
    body: JSON.stringify({ type: "direct", participant_ids: [input.userId] }),
  });
  const convJson = await convRes.json();
  if (!convRes.ok || !convJson.success) throw new Error(convJson.msg ?? "Could not open conversation");
  const conversationId = convJson.data?.ConversationID as string;
  const clientMessageId = await input.replayKey(conversationId, input.content);
  const msgRes = await fetch(`/api/messages/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: input.content.trim(), client_message_id: clientMessageId }),
  });
  const msgJson = await msgRes.json();
  if (!msgRes.ok || !msgJson.success) throw new Error(msgJson.msg ?? "Could not send message");
  return { conversationId };
}

export async function sendAdminEmail(input: {
  to?: string;
  userId?: string;
  subject: string;
  message: string;
}): Promise<void> {
  const res = await fetch("/api/admin/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: input.subject,
      message: input.message,
      ...(input.to ? { to: [input.to] } : { userIds: [input.userId] }),
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.success || (json.data?.failed ?? 0) > 0) {
    throw new Error(json.msg ?? "Email not sent");
  }
}

export async function sendSmsMessage(input: { to: string; message: string }): Promise<void> {
  const res = await fetch("/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: input.to, message: input.message }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error ?? json.msg ?? "Text not sent");
}

/** Send one coupon on one channel and record it on the coupon. */
export async function sendCoupon(input: {
  couponId: string;
  channel: SendChannel;
  message: string;
  subject: string;
  userId: string | null;
  email: string | null;
  phone: string | null;
  organizationId: string | null;
}): Promise<void> {
  let address: string | null = null;
  if (input.channel === "dm") {
    if (!input.userId) throw new Error("Pick the person to message");
    if (!input.organizationId) throw new Error("Select an organization from the avatar menu first");
    await sendDirectMessage({
      userId: input.userId,
      content: input.message,
      organizationId: input.organizationId,
      replayKey: (conversationId, content) => couponDmKey(input.couponId, conversationId, content),
    });
    address = input.userId;
  } else if (input.channel === "email") {
    if (!input.email && !input.userId) throw new Error("Add an email address");
    await sendAdminEmail({
      to: input.email ?? undefined,
      userId: input.email ? undefined : (input.userId ?? undefined),
      subject: input.subject,
      message: input.message,
    });
    address = input.email ?? input.userId;
  } else {
    if (!input.phone) throw new Error("Add a phone number");
    await sendSmsMessage({ to: input.phone, message: input.message });
    address = input.phone;
  }
  await markCouponSent(input.couponId, input.channel, address);
}
