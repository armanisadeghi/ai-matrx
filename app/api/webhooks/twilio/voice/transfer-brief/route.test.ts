/** @jest-environment node */
import twilio from "twilio";
import { POST } from "./route";
const original = process.env.TWILIO_AUTH_TOKEN;
const token = "receiver-brief-fixture";
function request(query: string, forged = false) {
  const url =
    "https://www.aimatrx.com/api/webhooks/twilio/voice/transfer-brief" + query;
  const params = {
    CallSid: "fixture",
    From: "+19497027626",
    To: "+19498072145",
    Summary: "private",
  };
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
test("signed receiver brief speaks bounded facts without ending or redialing", async () => {
  const response = await POST(request("?agentRequests=3&interruptions=1"));
  const xml = await response.text();
  expect(response.status).toBe(200);
  expect(xml).toContain("started 3 responses");
  expect(xml).toContain("was 1 interruption");
  expect(xml).toContain("Connecting you now");
  expect(xml).not.toMatch(/private|<Hangup|<Dial/);
});
test.each([
  "",
  "?agentRequests=-1&interruptions=1",
  "?agentRequests=501&interruptions=0",
  "?agentRequests=1&interruptions=501",
  "?agentRequests=1.5&interruptions=0",
])("%s malformed counts get generic introduction", async (query) => {
  const xml = await (await POST(request(query))).text();
  expect(xml).toContain("requested to speak to a person");
  expect(xml).not.toContain("started");
  expect(xml).not.toContain("<Hangup");
});
test("signature covers query counts", async () => {
  expect(
    (await POST(request("?agentRequests=3&interruptions=1", true))).status,
  ).toBe(403);
});
