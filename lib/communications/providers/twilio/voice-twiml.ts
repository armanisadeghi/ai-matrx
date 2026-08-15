/** TwiML for the disclosed, non-recording owner Voice beta control plane. */

import twilio from "twilio";

const VOICE = "Polly.Joanna-Neural";

export const OWNER_BETA_VOICE_DISCLOSURE_VERSION = "owner-beta-2026-08-15-v1";
export const OWNER_BETA_VOICE_DISCLOSURE =
  "Hello. You have reached A.I. Matrix. You are speaking with an A.I. system on a private internal test line. " +
  "This call is not being recorded right now. In a future explicitly enabled test, Twilio may record the call for A.I. Matrix, " +
  "and A.I. Matrix may store and review it for testing and improvement. To give affirmative consent and continue, press 1 or say, I agree. " +
  "Otherwise, hang up now.";

export const OWNER_BETA_NO_CONSENT_MESSAGE =
  "We did not receive affirmative consent. This call will end now. Nothing was recorded. Goodbye.";

export const OWNER_BETA_REJECTION_MESSAGE =
  "This private A.I. Matrix test line is not available for this caller. Nothing was recorded. Goodbye.";

export const OWNER_BETA_ACCEPTED_MESSAGE =
  "Thank you. Your consent was received. This owner beta is not recording this call, and the live A.I. conversation is not connected yet. " +
  "The A.I. Matrix voice control plane is working correctly. Goodbye.";

function disclosedResponse(message: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: VOICE }, message);
  response.hangup();
  return response.toString();
}

export function buildOwnerBetaConsentPromptTwiml(actionUrl: string): string {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    action: actionUrl,
    actionOnEmptyResult: true,
    hints: "I agree, yes I agree, I consent",
    input: ["dtmf", "speech"],
    language: "en-US",
    method: "POST",
    numDigits: 1,
    speechTimeout: "auto",
    timeout: 5,
  });
  gather.say({ voice: VOICE }, OWNER_BETA_VOICE_DISCLOSURE);

  // Defensive fallback if a provider ever ignores actionOnEmptyResult.
  response.say({ voice: VOICE }, OWNER_BETA_NO_CONSENT_MESSAGE);
  response.hangup();
  return response.toString();
}

export function buildOwnerBetaConsentAcceptedTwiml(): string {
  return disclosedResponse(OWNER_BETA_ACCEPTED_MESSAGE);
}

export function buildOwnerBetaNoConsentTwiml(): string {
  return disclosedResponse(OWNER_BETA_NO_CONSENT_MESSAGE);
}

export function buildOwnerBetaRejectedCallerTwiml(): string {
  return disclosedResponse(OWNER_BETA_REJECTION_MESSAGE);
}
