import { siteConfig } from "@/config/extras/site";

/** Canonical public contract for the AI Matrx recurring SMS program. */
export const SMS_PROGRAM_NAME = "AI Matrx SMS Notifications";
export const SMS_SENDER_PHONE = "+14158059951";
export const SMS_HR_SENDER_PHONE = "+16282965420";
/** First-party AI Matrx product notifications (agent work completed/failed/action required, capture and daily-question reminders). One-way. */
export const SMS_FIRST_PARTY_SENDER_PHONE = "+14159493803";
/** Personal Staff number: the AI Matrx personal assistant a person texts and calls. Two-way, voice-capable. */
export const SMS_PERSONAL_STAFF_SENDER_PHONE = "+14159808187";
export const SMS_SUPPORT_EMAIL = "support@aimatrx.com";
export const SMS_CONSENT_VERSION = "2026-08-26";

export const SMS_PRIVACY_PATH = "/privacy-policy";
export const SMS_TERMS_PATH = "/terms-and-conditions";
export const SMS_OPT_IN_PATH = "/sms";
export const SMS_SETTINGS_PATH = "/user-settings/communication/messaging";

/**
 * THE CONSENT RULE (carriers, CTIA, Twilio 30913 on 2026-09-26): each SMS program
 * collects its OWN consent — one unchecked box, one disclosure, one
 * `communication.sms_consent` row per program. Never one box for two programs.
 *
 * Program 1 — AI Matrx account and workplace notifications (the verified campaign).
 *   Consent rows: `transactional` + `notifications`. Disclosure below.
 * Program 2 — AI Matrx Personal Staff (its own 10DLC campaign, number
 *   SMS_PERSONAL_STAFF_SENDER_PHONE). Consent row: `ai_agent`. The enrollment
 *   door (`communication.enroll_verified_phone_for_assistant`) refuses to bind a
 *   Personal Staff destination without it.
 */
export const SMS_CONSENT_DISCLOSURE = `I agree to receive recurring automated transactional and service-related text messages from AI Matrx, a service operated by ${siteConfig.legalOperatorName}, at the number provided. Depending on the features I enable, messages may include AI Matrx account updates and employer-to-employee workforce notifications such as schedules, shifts, timekeeping, leave, training, onboarding, and workplace alerts. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase.`;

export const SMS_PERSONAL_STAFF_PROGRAM_NAME = "AI Matrx Personal Staff";
export const SMS_PERSONAL_STAFF_OPT_IN_PATH = "/sms/personal-staff";
export const SMS_PERSONAL_STAFF_CONSENT_VERSION = "2026-09-26";
export const SMS_PERSONAL_STAFF_CONSENT_DISCLOSURE = `I agree to receive recurring automated text messages from AI Matrx Personal Staff, a service operated by ${siteConfig.legalOperatorName}, at the number provided. Messages are replies to requests I send, confirmations that a request was received, and the results of tasks I ask it to do. No marketing messages are sent. Message frequency varies based on my requests. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase.`;

/** Ensures every outbound message identifies the registered AI Matrx product brand. */
export function formatSmsBody(body: string): string {
  const trimmedBody = body.trim();
  return /^AI Matrx\s*:/i.test(trimmedBody)
    ? trimmedBody
    : `AI Matrx: ${trimmedBody}`;
}
