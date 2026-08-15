/** Static TwiML for the production telephony-readiness proof. */

import twilio from "twilio";

export const STATIC_VOICE_DISCLOSURE =
  "Hello, you've reached A.I. Matrix. This is an A.I.-powered test line. " +
  "Test calls may be recorded and reviewed to improve the system. By continuing, you consent " +
  "to this internal test. The live A.I. conversation is not connected yet. " +
  "The A.I. Matrix phone webhook is working correctly. Goodbye.";

export function buildStaticVoiceTestTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "Polly.Joanna-Neural" }, STATIC_VOICE_DISCLOSURE);
  response.hangup();
  return response.toString();
}
