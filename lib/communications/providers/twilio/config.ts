/** Server-only Twilio configuration shared by messaging and voice adapters. */

export function getTwilioAuthToken(): string {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    throw new Error("TWILIO_AUTH_TOKEN environment variable is not set");
  }
  return token;
}

export function getApplicationBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://aimatrx.com";
}
