import { matchesDurableTwilioAttempt } from "./status-correlation";

const callback = {
  MessageSid: `SM${"a".repeat(32)}`,
  AccountSid: `AC${"b".repeat(32)}`,
  From: "+15550000001",
  To: "+15550000002",
};

const attempt = {
  direction: "outbound",
  provider: "twilio",
  provider_account_id: callback.AccountSid,
  from_number: callback.From,
  to_number: callback.To,
  twilio_sid: null,
};

describe("matchesDurableTwilioAttempt", () => {
  it("accepts the exact signed provider identity and address pair", () => {
    expect(matchesDurableTwilioAttempt(attempt, callback)).toBe(true);
  });

  it.each([
    ["account", { ...callback, AccountSid: `AC${"c".repeat(32)}` }],
    ["sender", { ...callback, From: "+15550000003" }],
    ["recipient", { ...callback, To: "+15550000004" }],
    ["message sid", { ...callback, MessageSid: "not-a-twilio-sid" }],
  ])("rejects a mismatched %s", (_label, changedCallback) => {
    expect(matchesDurableTwilioAttempt(attempt, changedCallback)).toBe(false);
  });

  it("accepts an already-linked row only for the same Twilio SID", () => {
    expect(
      matchesDurableTwilioAttempt(
        { ...attempt, twilio_sid: callback.MessageSid },
        callback,
      ),
    ).toBe(true);
    expect(
      matchesDurableTwilioAttempt(
        { ...attempt, twilio_sid: `SM${"d".repeat(32)}` },
        callback,
      ),
    ).toBe(false);
  });
});
