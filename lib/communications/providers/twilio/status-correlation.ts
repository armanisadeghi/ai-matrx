/** Pure guards for healing a Twilio create/finalize crash window. */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TWILIO_MESSAGE_SID_PATTERN = /^(SM|MM)[0-9a-f]{32}$/i;

export interface DurableTwilioAttempt {
  direction: string;
  provider: string;
  provider_account_id: string | null;
  from_number: string;
  to_number: string;
  twilio_sid: string | null;
}

export interface TwilioStatusIdentity {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
}

export function matchesDurableTwilioAttempt(
  attempt: DurableTwilioAttempt,
  callback: TwilioStatusIdentity,
): boolean {
  return (
    TWILIO_MESSAGE_SID_PATTERN.test(callback.MessageSid) &&
    attempt.direction === "outbound" &&
    attempt.provider === "twilio" &&
    attempt.provider_account_id === callback.AccountSid &&
    attempt.from_number === callback.From &&
    attempt.to_number === callback.To &&
    (!attempt.twilio_sid || attempt.twilio_sid === callback.MessageSid)
  );
}
