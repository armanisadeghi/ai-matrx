/** @jest-environment node */
import twilio from "twilio";
import { POST } from "./route";
const url = "https://www.aimatrx.com/api/webhooks/twilio/voice/transfer-ended";
const token = "transfer-callback-fixture";
const original = process.env.TWILIO_AUTH_TOKEN;
function request(params: Record<string, string>, forged = false) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": forged
        ? "forged"
        : twilio.getExpectedTwilioSignature(token, url, params),
    },
    body: new URLSearchParams(params),
  });
}
beforeEach(() => {
  process.env.TWILIO_AUTH_TOKEN = token;
});
afterAll(() => {
  process.env.TWILIO_AUTH_TOKEN = original;
});
test.each(["no-answer", "busy", "failed", "canceled", "unknown"])(
  "%s transfer explains failure and ends without redial",
  async (status) => {
    const response = await POST(
      request({
        CallStatus: "in-progress",
        DialCallStatus: status,
        ErrorMessage: "private",
      }),
    );
    const xml = await response.text();
    expect(response.status).toBe(200);
    expect(xml).toContain("could not reach a person");
    expect(xml).toContain("<Hangup/>");
    expect(xml).not.toContain("<Dial");
    expect(xml).not.toContain("private");
  },
);
test.each([
  { CallStatus: "completed", DialCallStatus: "no-answer" },
  { CallStatus: "in-progress", DialCallStatus: "completed" },
])("answered or hung-up call stays silent", async (params) => {
  const xml = await (await POST(request(params))).text();
  expect(xml).not.toContain("<Say");
  expect(xml).toContain("<Hangup/>");
});
test("forged result is refused", async () => {
  expect(
    (await POST(request({ DialCallStatus: "no-answer" }, true))).status,
  ).toBe(403);
});
