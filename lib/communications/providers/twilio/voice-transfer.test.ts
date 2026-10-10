/** @jest-environment node */
import { buildVoiceRelayEndedTwiml } from "./voice-twiml";
const params = {
  CallStatus: "in-progress",
  SessionStatus: "ended",
  From: "+19497027626",
  To: "+18005550101",
  HandoffData: JSON.stringify({
    reasonCode: "live-agent-handoff",
    number: "+18005559999",
    summary: "private",
  }),
};
test("application transfer uses only configured destination and a result callback", () => {
  const xml = buildVoiceRelayEndedTwiml(params, "+19498072145");
  expect(xml).toContain("<Dial");
  expect(xml).toContain('timeout="20"');
  expect(xml).toContain("/voice/transfer-ended");
  expect(xml).toContain("+19498072145</Number>");
  expect(xml).not.toContain("+18005559999");
  expect(xml).not.toContain("private");
});
test.each([null, "invalid", params.From, params.To])(
  "missing or looping target %s gets an honest fallback",
  (target) => {
    const xml = buildVoiceRelayEndedTwiml(params, target);
    expect(xml).not.toContain("<Dial");
    expect(xml).toContain("not available for transfer");
  },
);
test.each([
  "not JSON",
  "{}",
  "null",
  JSON.stringify({ reasonCode: "something-else" }),
])("unrecognized handoff does not dial", (HandoffData) => {
  expect(
    buildVoiceRelayEndedTwiml({ ...params, HandoffData }, "+19498072145"),
  ).not.toContain("<Dial");
});
test("completed caller never transfers", () => {
  expect(
    buildVoiceRelayEndedTwiml(
      { ...params, CallStatus: "completed" },
      "+19498072145",
    ),
  ).not.toContain("<Dial");
});

test("brief is on the receiver Number callback, never said to the caller", () => {
  const HandoffData = JSON.stringify({
    reasonCode: "live-agent-handoff",
    brief: { schemaVersion: 1, agentRequests: 3, interruptions: 1 },
    summary: "private transcript",
  });
  const xml = buildVoiceRelayEndedTwiml(
    { ...params, HandoffData },
    "+19498072145",
  );
  expect(xml).toContain("<Number url=");
  expect(xml).toContain(
    "/voice/transfer-brief?agentRequests=3&amp;interruptions=1",
  );
  expect(xml).not.toContain("private transcript");
  expect(xml).not.toContain("started 3 responses");
});

test.each([
  { schemaVersion: 2, agentRequests: 3, interruptions: 1 },
  { schemaVersion: 1, agentRequests: "3", interruptions: 1 },
  { schemaVersion: 1, agentRequests: 501, interruptions: 1 },
  { schemaVersion: 1, agentRequests: 3, interruptions: -1 },
])("invalid brief %j never propagates counts to receiver URL", (brief) => {
  const xml = buildVoiceRelayEndedTwiml(
    {
      ...params,
      HandoffData: JSON.stringify({ reasonCode: "live-agent-handoff", brief }),
    },
    "+19498072145",
  );
  expect(xml).toContain("<Number url=");
  expect(xml).not.toContain("agentRequests=");
});
