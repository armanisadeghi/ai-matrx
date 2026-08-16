import { evaluateConversationRelayReadiness } from "./conversation-relay-readiness";

describe("ConversationRelay readiness", () => {
  test("reports the inert implementation foundations without opening live gates", () => {
    const readiness = evaluateConversationRelayReadiness({
      strict_wire_contract_ready: true,
      signed_admission_ready: true,
      one_time_reference_ready: true,
      canonical_runtime_ready: true,
      bounded_session_host_ready: true,
      secret_free_telemetry_ready: true,
      provider_playback_decoder_ready: false,
      canonical_call_lifecycle_ready: true,
      playback_activity_persistence_ready: false,
      public_route_mounted: false,
      owned_number_routed: false,
      code_switch_enabled: false,
      provider_switch_enabled: false,
      program_switch_enabled: false,
    });

    expect(readiness).toMatchObject({
      ready: false,
      passedGateCount: 7,
      totalGateCount: 14,
    });
    expect(readiness.blockedReasons).toHaveLength(7);
  });

  test("requires every independent gate", () => {
    const readiness = evaluateConversationRelayReadiness({
      strict_wire_contract_ready: true,
      signed_admission_ready: true,
      one_time_reference_ready: true,
      canonical_runtime_ready: true,
      bounded_session_host_ready: true,
      secret_free_telemetry_ready: true,
      provider_playback_decoder_ready: true,
      canonical_call_lifecycle_ready: true,
      playback_activity_persistence_ready: true,
      public_route_mounted: true,
      owned_number_routed: true,
      code_switch_enabled: true,
      provider_switch_enabled: true,
      program_switch_enabled: true,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.passedGateCount).toBe(14);
    expect(readiness.blockedReasons).toEqual([]);
  });
});
