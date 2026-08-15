/**
 * Twilio SMS Client
 *
 * Lazy-initialized singleton Twilio client for server-side use only.
 * Never import this in client components.
 */

import Twilio from 'twilio';
import {
  getApplicationBaseUrl,
  getTwilioAuthToken,
} from '@/lib/communications/providers/twilio/config';

let twilioClient: ReturnType<typeof Twilio> | null = null;

export function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid) {
      throw new Error('TWILIO_ACCOUNT_SID environment variable is not set');
    }
    if (!authToken) {
      throw new Error('TWILIO_AUTH_TOKEN environment variable is not set');
    }

    twilioClient = Twilio(accountSid, authToken);
  }
  return twilioClient;
}

export function getMessagingServiceSid(): string {
  const sid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid) {
    throw new Error('TWILIO_MESSAGING_SERVICE_SID environment variable is not set');
  }
  return sid;
}

export function getVerifyServiceSid(): string {
  const sid = process.env.TWILIO_VERIFY_SID;
  if (!sid) {
    throw new Error('TWILIO_VERIFY_SID environment variable is not set');
  }
  return sid;
}

export function getAuthToken(): string {
  return getTwilioAuthToken();
}

export function getAppBaseUrl(): string {
  return getApplicationBaseUrl();
}
