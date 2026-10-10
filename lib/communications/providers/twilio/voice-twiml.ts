/** TwiML for the disclosed owner Voice beta control plane. */

import twilio from "twilio";
import { getApplicationBaseUrl } from "./config";

export const VOICE_RELAY_ENDED_PATH = "/api/webhooks/twilio/voice/relay-ended";

export const VOICE_TRANSFER_ENDED_PATH =
  "/api/webhooks/twilio/voice/transfer-ended";

export const VOICE_TRANSFER_BRIEF_PATH =
  "/api/webhooks/twilio/voice/transfer-brief";

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

export const OWNER_BETA_CONVERSATION_RELAY_GREETING =
  "Recording has started. How can I help you?";

export const OWNER_BETA_CONVERSATION_RELAY_UNAVAILABLE_MESSAGE =
  "Thank you. Your consent was received. Recording has started, but the A.I. assistant could not connect. This call will end now. Goodbye.";

export interface OwnerBetaRecordingStart {
  recordingStatusCallbackUrl: string;
}

export interface OwnerBetaConversationRelayConnect {
  sessionReference: string;
  url: string;
}

export interface OwnerBetaConsentAcceptedTwimlOptions {
  conversationRelay?: OwnerBetaConversationRelayConnect | null;
  recording: OwnerBetaRecordingStart | null;
}

function disclosedResponse(message: string): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: VOICE }, message);
  response.hangup();
  return response.toString();
}

/** The Connect action runs after the relay closes, including a failed WebSocket. */
export function buildVoiceRelayEndedTwiml(
  params: Record<string, string>,
  transferNumber: string | null = null,
): string {
  // The caller has already hung up. Do not manufacture an apology or restart the call.
  if (
    params.CallStatus === "completed" ||
    params.SessionStatus === "completed"
  ) {
    const response = new twilio.twiml.VoiceResponse();
    response.hangup();
    return response.toString();
  }
  if (
    params.SessionStatus === "ended" &&
    requestsHumanTransfer(params.HandoffData)
  ) {
    if (
      !transferNumber ||
      !/^\+1[2-9]\d{9}$/.test(transferNumber) ||
      transferNumber === params.To ||
      transferNumber === params.From
    ) {
      return disclosedResponse(
        "A person is not available for transfer right now. Please call again later. Goodbye.",
      );
    }
    const response = new twilio.twiml.VoiceResponse();
    response.say(
      { voice: VOICE },
      "Please hold while I connect you to a person.",
    );
    const dial = response.dial({
      action: new URL(
        VOICE_TRANSFER_ENDED_PATH,
        getApplicationBaseUrl(),
      ).toString(),
      method: "POST",
      timeout: 20,
    });
    const briefUrl = new URL(
      VOICE_TRANSFER_BRIEF_PATH,
      getApplicationBaseUrl(),
    );
    const brief = readVoiceTransferBrief(params.HandoffData);
    if (brief) {
      briefUrl.searchParams.set("agentRequests", String(brief.agentRequests));
      briefUrl.searchParams.set("interruptions", String(brief.interruptions));
    }
    dial.number({ url: briefUrl.toString(), method: "POST" }, transferNumber);
    return response.toString();
  }
  // Provider error text and handoffData can carry private content; never read them aloud.
  if (params.SessionStatus === "ended") {
    return disclosedResponse("Thank you for calling A.I. Matrix. Goodbye.");
  }
  return disclosedResponse(
    "The A.I. assistant's connection has ended. Please call again to continue. Goodbye.",
  );
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

  if (options.conversationRelay) {
    const connect = response.connect({
      action: new URL(
        VOICE_RELAY_ENDED_PATH,
        getApplicationBaseUrl(),
      ).toString(),
      method: "POST",
    });
    const relay = connect.conversationRelay({
      url: options.conversationRelay.url,
      dtmfDetection: true,
      welcomeGreeting: OWNER_BETA_CONVERSATION_RELAY_GREETING,
    });
    relay.parameter({
      name: "sessionReference",
      value: options.conversationRelay.sessionReference,
    });
    return response.toString();
  }

  response.say(
    { voice: VOICE },
    OWNER_BETA_CONVERSATION_RELAY_UNAVAILABLE_MESSAGE,
  );
  response.hangup();
  return response.toString();
}

export function buildOwnerBetaNoConsentTwiml(): string {
  return disclosedResponse(OWNER_BETA_NO_CONSENT_MESSAGE);
}

export function buildOwnerBetaRejectedCallerTwiml(): string {
  return disclosedResponse(OWNER_BETA_REJECTION_MESSAGE);
}

/** Only the application control code requests transfer; a payload never supplies a number. */
export function requestsHumanTransfer(raw: string | undefined): boolean {
  if (!raw || raw.length > 4096) return false;
  try {
    const value: unknown = JSON.parse(raw);
    return (
      typeof value === "object" &&
      value !== null &&
      "reasonCode" in value &&
      value.reasonCode === "live-agent-handoff"
    );
  } catch {
    return false;
  }
}

export function buildVoiceTransferEndedTwiml(
  params: Record<string, string>,
): string {
  if (
    params.CallStatus === "completed" ||
    params.DialCallStatus === "completed" ||
    params.DialCallStatus === "answered"
  ) {
    const response = new twilio.twiml.VoiceResponse();
    response.hangup();
    return response.toString();
  }
  return disclosedResponse(
    "We could not reach a person. Please call again later. Goodbye.",
  );
}

export interface VoiceTransferBrief {
  agentRequests: number;
  interruptions: number;
}

/** Counts only. Caller speech, model output, tools and unverified claims never travel in this brief. */
export function readVoiceTransferBrief(
  raw: string | undefined,
): VoiceTransferBrief | null {
  if (!raw || !requestsHumanTransfer(raw)) return null;
  try {
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || !("brief" in payload))
      return null;
    const brief = payload.brief;
    if (
      !brief ||
      typeof brief !== "object" ||
      !("schemaVersion" in brief) ||
      brief.schemaVersion !== 1 ||
      !("agentRequests" in brief) ||
      !("interruptions" in brief)
    )
      return null;
    const { agentRequests, interruptions } = brief;
    if (
      typeof agentRequests !== "number" ||
      !Number.isSafeInteger(agentRequests) ||
      agentRequests < 0 ||
      agentRequests > 500 ||
      typeof interruptions !== "number" ||
      !Number.isSafeInteger(interruptions) ||
      interruptions < 0 ||
      interruptions > 500
    )
      return null;
    return { agentRequests, interruptions };
  } catch {
    return null;
  }
}

export function buildVoiceTransferBriefTwiml(
  brief: VoiceTransferBrief | null,
): string {
  const response = new twilio.twiml.VoiceResponse();
  response.say(
    { voice: VOICE },
    "A caller has requested to speak to a person through A.I. Matrix. " +
      (brief
        ? `The A.I. assistant started ${brief.agentRequests} ${brief.agentRequests === 1 ? "response" : "responses"}. There ${brief.interruptions === 1 ? "was" : "were"} ${brief.interruptions} ${brief.interruptions === 1 ? "interruption" : "interruptions"}. `
        : "") +
      "Connecting you now.",
  );
  return response.toString();
}
