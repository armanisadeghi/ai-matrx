/** TwiML for the disclosed owner Voice beta control plane. */

import twilio from "twilio";

const VOICE = "Polly.Joanna-Neural";

export const OWNER_BETA_VOICE_DISCLOSURE_VERSION = "owner-beta-2026-08-17-v2";
export const OWNER_BETA_VOICE_DISCLOSURE =
  "Hello. You have reached A.I. Matrix. You are speaking with an A.I. system on a private internal test line. " +
  "This call is not being recorded yet. If you continue, Twilio will record the call for A.I. Matrix, and A.I. Matrix will securely store and review it for testing and improvement. " +
  "The recording will be retained for up to 30 days, subject to earlier deletion. To give affirmative consent and continue, press 1 or say, I agree. " +
  "If you do not consent, hang up now.";

export const OWNER_BETA_NO_CONSENT_MESSAGE =
  "We did not receive affirmative consent. This call will end now. Nothing was recorded. Goodbye.";

export const OWNER_BETA_REJECTION_MESSAGE =
  "This private A.I. Matrix test line is not available for this caller. Nothing was recorded. Goodbye.";

export const OWNER_BETA_ACCEPTED_NON_RECORDING_MESSAGE =
  "Thank you. Your consent was received, but recording is not available right now. Nothing was recorded. Goodbye.";

export const OWNER_BETA_RECORDING_STARTED_MESSAGE =
  "Thank you. Your consent was received. Recording starts now. The A.I. Matrix recording test is working correctly. Goodbye.";

export interface OwnerBetaRecordingStart {
  recordingStatusCallbackUrl: string;
}

export interface OwnerBetaConsentAcceptedTwimlOptions {
  recording: OwnerBetaRecordingStart | null;
}

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

export function buildOwnerBetaConsentAcceptedTwiml(
  options: OwnerBetaConsentAcceptedTwimlOptions = { recording: null },
): string {
  if (options.recording === null) {
    return disclosedResponse(OWNER_BETA_ACCEPTED_NON_RECORDING_MESSAGE);
  }

  const response = new twilio.twiml.VoiceResponse();
  const start = response.start();
  start.recording({
    channels: "dual",
    recordingStatusCallback: options.recording.recordingStatusCallbackUrl,
    recordingStatusCallbackEvent: ["in-progress", "completed", "absent"],
    recordingStatusCallbackMethod: "POST",
    track: "both",
    trim: "do-not-trim",
  });
  response.say({ voice: VOICE }, OWNER_BETA_RECORDING_STARTED_MESSAGE);
  response.hangup();
  return response.toString();
}

export function buildOwnerBetaNoConsentTwiml(): string {
  return disclosedResponse(OWNER_BETA_NO_CONSENT_MESSAGE);
}

export function buildOwnerBetaRejectedCallerTwiml(): string {
  return disclosedResponse(OWNER_BETA_REJECTION_MESSAGE);
}
