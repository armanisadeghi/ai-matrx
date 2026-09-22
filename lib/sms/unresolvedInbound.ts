/**
 * AN INBOUND TEXT WE CANNOT PLACE LEAVES A TRACE AND GETS AN ANSWER.
 *
 * 🚨 THE DEFECT THIS CLOSES (P1, measured live 2026-09-21).
 *
 * `test@test.com` completed the real `/api/sms/verify` flow and then texted the
 * assistant number. `resolveSmsInboundContext` answered
 * `not_found / verified_user_binding_not_found`, and the webhook did this:
 *
 *   await completeInboundSmsReceipt(receipt.receiptId, null, `${status}:${reason}`);
 *   return new NextResponse(twiml.toString());   // empty TwiML
 *
 * The message produced NO `communication.sms_messages` row, NO
 * `ops.system_error` row and NO reply. It vanished. The only trace anywhere was
 * a `processing_notes` string on a webhook-log row nobody reads, on a table
 * whose job is provider idempotency rather than operations. A person who had
 * just given us their number, accepted the disclosure and been told
 * "SMS notifications enabled" texted us and heard nothing back, forever, and no
 * alarm anywhere knew.
 *
 * That silence is its own defect, separate from the binding gap that caused it:
 * the binding gap is now closed at the enrollment door, but the NEXT reason an
 * inbound text cannot be placed must not disappear the same way. Nothing fails
 * silently (law 4) — and a stand-in that "handles" a message by dropping it is
 * the purest form of failing silently.
 *
 * WHAT THIS DOES, AND THE TWO THINGS IT REFUSES TO DO.
 *
 *  1. IT ALWAYS FILES THE ROW. Every unresolved inbound on a number WE own
 *     writes `ops.system_error` with the reason, the two numbers, the provider
 *     message id and a remedy sentence. The organization is the DESTINATION's
 *     registration — `communication.sms_phone_numbers.organization_id`, the
 *     organization that owns the number the message was sent TO. Nothing is
 *     substituted and nothing is guessed (`lib/sms/routingFailure.ts`); when the
 *     destination is not ours at all we have no tenant to file under and the
 *     existing loud `destination_not_owned` path already owns that case.
 *
 *  2. IT REPLIES ONLY TO SOMEBODY WHO WAS OBVIOUSLY TRYING TO REACH THE
 *     ASSISTANT, AND ONLY ONCE A DAY. The reply is gated on all of:
 *       · the reason being `verified_user_binding_not_found` — "we do not know
 *         this number", the one case where the SENDER is the person who can act.
 *         Every other reason (`destination_inactive`, `canonical_consent_opted_out`,
 *         an ambiguity) is OUR fault or OUR refusal, and texting a person about
 *         our own provisioning would be noise they cannot use;
 *       · the destination being a live, assistant-enabled number, so the text
 *         really was an attempt to talk to the assistant;
 *       · the sender not being suppressed — `crm.contact_medium` is the one
 *         suppression authority and a STOP outranks every courtesy we have;
 *       · no reply to this exact (from, to) pair in the last 24 hours.
 *     The last two are not politeness. An unconditional auto-reply to any
 *     unknown number is an A2P violation risk and a spam amplifier: a spoofed
 *     or looped sender turns our registered number into an outbound flood under
 *     our own brand. One honest answer a day, to a number that texted OUR
 *     assistant, is the most we can say and still be telling the truth.
 */

import { createAdminClient } from "@/utils/supabase/adminClient";
import { SMS_OPT_IN_PATH } from "@/features/sms/compliance";
import { siteConfig } from "@/config/extras/site";
import type { InboundSmsPayload } from "./types";
import type { SmsInboundContextResolution } from "./identity";
import { isPhoneNumberOptedOut } from "./receive";
import { sendSms } from "./send";

/** The one `ops.system_error.kind` for an inbound text we could not place. */
export const SMS_INBOUND_UNRESOLVED_KIND = "sms_inbound_unresolved" as const;

/** The only unresolved reason whose remedy belongs to the SENDER. */
const SENDER_ACTIONABLE_REASON = "verified_user_binding_not_found";

/** One honest answer per (from, to) per this many ms. */
const REPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface UnresolvedInboundReport {
  /** True when an `ops.system_error` row now exists for this message. */
  logged: boolean;
  /** True when the sender received the honest "here is how to enroll" reply. */
  replied: boolean;
  /** Why no reply was sent, when none was. Never silent. */
  replySkipped?:
    | "reason_is_not_the_senders_to_fix"
    | "destination_is_not_an_assistant_number"
    | "sender_is_suppressed"
    | "already_answered_today"
    | "send_failed";
}

/**
 * The sentence a person gets back. It says what happened, that we are not
 * ignoring them, and the ONE thing they can do — never a code, never a table
 * name, never "contact support" as a dead end.
 */
export function unresolvedInboundReply(): string {
  return (
    `We got your message, but this number isn't linked to an AI Matrx account yet, ` +
    `so nobody can answer it. Add and verify this phone in your AI Matrx settings ` +
    `(${siteConfig.url}${SMS_OPT_IN_PATH}) and text again — it'll work straight away. Reply STOP to opt out.`
  );
}

/** The operations sentence: what broke, for whom, and what fixes it. */
export function unresolvedInboundErrorText(
  reason: string,
  fromNumber: string,
  toNumber: string,
): string {
  const remedy =
    reason === SENDER_ACTIONABLE_REASON
      ? `${fromNumber} has no communication.sms_notification_preferences row bound to this ` +
        `destination and program, so the assistant cannot place the sender. If this person ` +
        `believes they verified, their enrollment never got its assistant binding: re-run it ` +
        `through communication.enroll_verified_phone_for_assistant, the one enrollment door.`
      : `Inbound resolution refused this message before any assistant work. Read the reason ` +
        `and repair the destination registration or the sender's enrollment; nothing about ` +
        `this message was stored in communication.sms_messages.`;
  return (
    `An inbound text to ${toNumber} from ${fromNumber} could not be placed (${reason}). ` +
    `It received no assistant turn. ${remedy}`
  );
}

/**
 * File the row, and answer the sender when the sender is the one who can act.
 *
 * Never throws: this runs on the webhook's failure path, and an exception here
 * would turn "we could not place your text" into "Twilio retries forever".
 * Every internal failure is logged with its own sentence.
 */
export async function reportUnresolvedInboundSms(args: {
  payload: InboundSmsPayload;
  context: SmsInboundContextResolution;
  providerEventKey: string;
}): Promise<UnresolvedInboundReport> {
  const { payload, context, providerEventKey } = args;
  const reason = "reason" in context ? context.reason : "unknown";
  const report: UnresolvedInboundReport = { logged: false, replied: false };

  try {
    const supabase = createAdminClient();

    const { data: destinations } = await supabase
      .schema("communication")
      .from("sms_phone_numbers")
      .select("id, organization_id, program_key, is_active, assistant_enabled")
      .eq("provider", context.provider)
      .eq("provider_account_id", context.providerAccountId)
      .eq("phone_number", context.destination)
      .is("deleted_at", null)
      .limit(2);

    const destination = destinations?.length === 1 ? destinations[0] : null;
    if (!destination) {
      // No registration means no tenant, and a row filed in an organization
      // nobody chose is worse than no row. `destination_not_owned` already
      // announces itself through SmsInboundRoutingFailure.
      console.error(
        `[${SMS_INBOUND_UNRESOLVED_KIND}] ${context.source} -> ${context.destination} ` +
          `(${reason}) could not be filed: ${context.destination} resolves to ` +
          `${destinations?.length ?? 0} registrations, so this message has no organization. ` +
          `Remedy: register the number to the organization that owns it (Administration → SMS → Numbers).`,
      );
      return report;
    }

    const { error: insertError } = await supabase
      .schema("ops")
      .from("system_error")
      .insert({
        kind: SMS_INBOUND_UNRESOLVED_KIND,
        organization_id: destination.organization_id,
        source_app: "matrx-frontend",
        source_feature: "communications.sms",
        route: "/api/webhooks/twilio/sms",
        error_type: reason,
        error_text: unresolvedInboundErrorText(
          reason,
          context.source,
          context.destination,
        ),
        payload: {
          from_number: context.source,
          to_number: context.destination,
          provider: context.provider,
          provider_message_id: context.providerMessageId,
          provider_event_key: providerEventKey,
          program_key: destination.program_key,
          status: context.status,
          reason,
          body_length: payload.Body.length,
        },
        context: {
          destination_id: destination.id,
          destination_is_active: destination.is_active,
          destination_assistant_enabled: destination.assistant_enabled,
        },
      });

    if (insertError) {
      console.error(
        `[${SMS_INBOUND_UNRESOLVED_KIND}] could not file the ops.system_error row for ` +
          `${context.source} -> ${context.destination} (${reason}): ${insertError.message}`,
      );
    } else {
      report.logged = true;
    }

    if (reason !== SENDER_ACTIONABLE_REASON) {
      report.replySkipped = "reason_is_not_the_senders_to_fix";
      return report;
    }
    if (!destination.is_active || !destination.assistant_enabled) {
      report.replySkipped = "destination_is_not_an_assistant_number";
      return report;
    }
    if (await isPhoneNumberOptedOut(context.source, destination.organization_id)) {
      report.replySkipped = "sender_is_suppressed";
      return report;
    }

    const since = new Date(Date.now() - REPLY_COOLDOWN_MS).toISOString();
    const { data: answeredToday } = await supabase
      .schema("ops")
      .from("system_error")
      .select("id")
      .eq("kind", SMS_INBOUND_UNRESOLVED_KIND)
      .gte("occurred_at", since)
      .contains("metadata", { replied_to: context.source })
      .limit(1);
    if (answeredToday?.length) {
      report.replySkipped = "already_answered_today";
      return report;
    }

    const sent = await sendSms({
      to: context.source,
      from: context.destination,
      body: unresolvedInboundReply(),
    });
    if (!sent.success) {
      console.error(
        `[${SMS_INBOUND_UNRESOLVED_KIND}] the honest reply to ${context.source} could not be ` +
          `sent: ${sent.error ?? "unknown provider error"}. The person is still waiting.`,
      );
      report.replySkipped = "send_failed";
      return report;
    }
    report.replied = true;

    // The cooldown reads this stamp, so it is written on the row we just filed
    // rather than in memory: the next inbound arrives on a different serverless
    // invocation and would otherwise answer again.
    await supabase
      .schema("ops")
      .from("system_error")
      .update({
        metadata: {
          replied_to: context.source,
          replied_at: new Date().toISOString(),
          provider_message_id: sent.sid ?? null,
        },
      })
      .eq("kind", SMS_INBOUND_UNRESOLVED_KIND)
      .eq("payload->>provider_event_key", providerEventKey);

    return report;
  } catch (err) {
    console.error(
      `[${SMS_INBOUND_UNRESOLVED_KIND}] reporting failed for ${context.source} -> ` +
        `${context.destination} (${reason}):`,
      err,
    );
    return report;
  }
}
