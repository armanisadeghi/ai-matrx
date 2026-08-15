import {
  assistantBlockedReasonLabel,
  assistantBindingLabel,
  smsAssistantProgramFromRpc,
  smsPermissionLabel,
  type SmsAssistantProgramState,
} from "./assistant-program";

const base: SmsAssistantProgramState = {
  destinationId: "11111111-1111-4111-8111-111111111111",
  maskedPhone: "(***) ***-1234",
  programKey: "assistant",
  numberActive: true,
  globalAssistantEnabled: true,
  smsEnabled: true,
  userAssistantEnabled: false,
  verifiedUserPhone: "+15550000002",
  preferredAgentId: null,
  preferredAgentVersionId: null,
  smsConversationId: null,
  chatConversationId: null,
  identityStatus: "resolved",
  consentStatus: "opted_in",
  ready: false,
  blockedReasons: ["Choose a saved agent."],
};

describe("assistantBindingLabel", () => {
  it("never describes an unselected agent as ready", () => {
    expect(assistantBindingLabel(base)).toBe("Agent not selected");
  });

  it("distinguishes a paused configured binding", () => {
    expect(
      assistantBindingLabel({ ...base, preferredAgentId: "agent-id" }),
    ).toBe("Paused");
  });

  it("uses the server's readiness verdict", () => {
    expect(
      assistantBindingLabel({
        ...base,
        userAssistantEnabled: true,
        preferredAgentId: "agent-id",
        ready: true,
        blockedReasons: [],
      }),
    ).toBe("Ready for owner testing");
  });
});

describe("assistantBlockedReasonLabel", () => {
  it("turns durable block codes into clear next steps", () => {
    expect(assistantBlockedReasonLabel("agent_not_selected")).toBe(
      "Choose a saved agent.",
    );
  });

  it("does not expose an unknown internal code", () => {
    expect(assistantBlockedReasonLabel("future_internal_code")).toBe(
      "Additional setup is required.",
    );
  });
});

describe("smsPermissionLabel", () => {
  it("keeps notification enrollment distinct from assistant replies", () => {
    expect(smsPermissionLabel(base)).toBe("SMS notifications on");
    expect(smsPermissionLabel({ ...base, smsEnabled: false })).toBe(
      "SMS notifications off",
    );
  });
});

describe("smsAssistantProgramFromRpc", () => {
  it("normalizes nullable values that Postgres RETURNS TABLE types overstate", () => {
    const state = smsAssistantProgramFromRpc({
      blocked_reasons: ["agent_not_selected"],
      chat_conversation_id: null,
      consent_status: "opted_in",
      destination_id: "11111111-1111-4111-8111-111111111111",
      global_assistant_enabled: true,
      identity_status: "resolved",
      masked_phone: "•••1234",
      number_active: true,
      preferred_agent_id: null,
      preferred_agent_version_id: null,
      program_key: "ai_matrx_owner_beta",
      ready: false,
      sms_conversation_id: null,
      sms_enabled: true,
      user_assistant_enabled: false,
      verified_user_phone: "+15550000002",
    });

    expect(state.preferredAgentId).toBeNull();
    expect(state.chatConversationId).toBeNull();
    expect(state.smsEnabled).toBe(true);
    expect(state.consentStatus).toBe("opted_in");
  });
});
