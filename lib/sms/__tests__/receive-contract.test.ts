import {
  classifySmsPolicyKeyword,
  parseInboundSmsPayload,
} from "@/lib/sms/receive";

describe("SMS receive boundary contract", () => {
  test("parses signed provider fields, opt-out metadata, and media without assertions", () => {
    const payload = parseInboundSmsPayload({
      MessageSid: "SM123",
      AccountSid: "AC123",
      From: "+14155550100",
      To: "+14158059951",
      Body: "STOP",
      ApiVersion: "2010-04-01",
      OptOutType: "STOP",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/media/one",
      MediaContentType0: "image/jpeg",
    });

    expect(payload.OptOutType).toBe("STOP");
    expect(payload.MediaUrl0).toBe("https://api.twilio.com/media/one");
    expect(classifySmsPolicyKeyword(payload)).toBe("opt_out");
  });

  test("rejects a payload without durable provider identity", () => {
    expect(() =>
      parseInboundSmsPayload({
        AccountSid: "AC123",
        From: "+14155550100",
        To: "+14158059951",
        ApiVersion: "2010-04-01",
      }),
    ).toThrow("MessageSid");
  });
});
