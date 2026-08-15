/**
 * Shared Twilio webhook signature validation for Messaging, Voice, and future channels.
 *
 * Twilio signs the exact public URL plus the form fields. Vercel terminates TLS before the route,
 * so the validator reconstructs that public URL from forwarded headers while preserving the
 * request query string.
 */

import twilio from "twilio";

import { extractErrorMessage } from "@/utils/errors";

import { getApplicationBaseUrl, getTwilioAuthToken } from "./config";

export interface TwilioWebhookValidationResult {
  valid: boolean;
  params: Record<string, string>;
  error?: string;
  signedUrl?: string;
}

function firstForwardedValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim();
  return first || null;
}

export function buildTwilioWebhookUrl(request: Request, pathname: string): string {
  const requestUrl = new URL(request.url);
  const fallbackUrl = new URL(getApplicationBaseUrl());
  const proto =
    firstForwardedValue(request.headers.get("x-forwarded-proto")) ??
    requestUrl.protocol.replace(":", "") ??
    fallbackUrl.protocol.replace(":", "");
  const host =
    firstForwardedValue(request.headers.get("x-forwarded-host")) ??
    firstForwardedValue(request.headers.get("host")) ??
    fallbackUrl.host;

  return `${proto}://${host}${pathname}${requestUrl.search}`;
}

export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.TWILIO_SKIP_VALIDATION === "true"
  ) {
    console.warn("Twilio signature validation skipped in explicit development mode");
    return true;
  }

  return twilio.validateRequest(getTwilioAuthToken(), signature, url, params);
}

export async function validateTwilioWebhook(
  request: Request,
  pathname: string,
): Promise<TwilioWebhookValidationResult> {
  try {
    const signature = request.headers.get("x-twilio-signature");
    if (!signature) {
      return {
        valid: false,
        params: {},
        error: "Missing X-Twilio-Signature header",
      };
    }

    const body = await request.text();
    const params = Object.fromEntries(new URLSearchParams(body).entries());
    const signedUrl = buildTwilioWebhookUrl(request, pathname);
    const valid = validateTwilioSignature(signature, signedUrl, params);

    return valid
      ? { valid: true, params, signedUrl }
      : {
          valid: false,
          params,
          signedUrl,
          error: "Invalid webhook signature",
        };
  } catch (error) {
    return {
      valid: false,
      params: {},
      error: extractErrorMessage(error),
    };
  }
}
