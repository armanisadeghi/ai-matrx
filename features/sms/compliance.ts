import { siteConfig } from "@/config/extras/site";

/** Canonical public contract for the AI Matrx recurring SMS program. */
export const SMS_PROGRAM_NAME = "AI Matrx SMS Notifications";
export const SMS_SENDER_PHONE = "+14158059951";
export const SMS_HR_SENDER_PHONE = "+16282965420";
export const SMS_SUPPORT_EMAIL = "support@aimatrx.com";
export const SMS_CONSENT_VERSION = "2026-08-26";

export const SMS_PRIVACY_PATH = "/privacy-policy";
export const SMS_TERMS_PATH = "/terms-and-conditions";
export const SMS_OPT_IN_PATH = "/sms";
export const SMS_SETTINGS_PATH = "/user-settings/communication/messaging";

export const SMS_CONSENT_DISCLOSURE = `I agree to receive recurring automated transactional and service-related text messages from AI Matrx, a service operated by ${siteConfig.legalOperatorName}, at the number provided. Depending on the features I enable, messages may include AI Matrx account updates and employer-to-employee workforce notifications such as schedules, shifts, timekeeping, leave, training, onboarding, and workplace alerts. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase.`;

/** Ensures every outbound message identifies the registered AI Matrx product brand. */
export function formatSmsBody(body: string): string {
  const trimmedBody = body.trim();
  return /^AI Matrx\s*:/i.test(trimmedBody)
    ? trimmedBody
    : `AI Matrx: ${trimmedBody}`;
}
