/** Fail-closed readiness for the long-lived ConversationRelay call path. */

const GATE_DEFINITIONS = [
  {
    key: "strict_wire_contract_ready",
    label: "Strict provider protocol",
    blockedReason: "The provider message contract is not strictly validated.",
  },
  {
    key: "signed_admission_ready",
    label: "Signed admission",
    blockedReason:
      "The WebSocket handshake cannot yet prove the exact provider signature.",
  },
  {
    key: "one_time_reference_ready",
    label: "One-time call reference",
    blockedReason:
      "The call cannot yet consume one exact durable session reference.",
  },
  {
    key: "canonical_runtime_ready",
    label: "Canonical saved-agent runtime",
    blockedReason:
      "The call is not connected to the canonical saved-agent execution path.",
  },
  {
    key: "bounded_session_host_ready",
    label: "Bounded session host",
    blockedReason:
      "The long-lived session host does not yet enforce its protocol and resource ceilings.",
  },
  {
    key: "secret_free_telemetry_ready",
    label: "Secret-free telemetry",
    blockedReason:
      "Session outcomes are not yet observable without private content or identifiers.",
  },
  {
    key: "provider_playback_decoder_ready",
    label: "Played-audio evidence",
    blockedReason:
      "The exact provider tokens-played and speaker event payloads have not been verified and decoded.",
  },
  {
    key: "canonical_call_lifecycle_ready",
    label: "Canonical call lifecycle",
    blockedReason:
      "Provider call events cannot yet be deduplicated and attached to the canonical CRM interaction and activity ledger.",
  },
  {
    key: "playback_activity_persistence_ready",
    label: "Playback lifecycle visibility",
    blockedReason:
      "Playback and session aggregates are not yet durably attached to the canonical CRM interaction and activity ledger.",
  },
  {
    key: "public_route_mounted",
    label: "Reviewed network route",
    blockedReason: "No reviewed production WebSocket route is mounted.",
  },
  {
    key: "owned_number_routed",
    label: "Owned-number routing",
    blockedReason: "No owned number routes calls to ConversationRelay.",
  },
  {
    key: "code_switch_enabled",
    label: "Code launch switch",
    blockedReason: "The code-level Voice launch switch is off.",
  },
  {
    key: "provider_switch_enabled",
    label: "Provider launch switch",
    blockedReason: "The provider Voice launch switch is off.",
  },
  {
    key: "program_switch_enabled",
    label: "Program launch switch",
    blockedReason: "The owner Voice program launch switch is off.",
  },
] as const;

export type ConversationRelayReadinessGateKey =
  (typeof GATE_DEFINITIONS)[number]["key"];

export type ConversationRelayReadinessGateState = Record<
  ConversationRelayReadinessGateKey,
  boolean
>;

export interface ConversationRelayReadinessGate {
  key: ConversationRelayReadinessGateKey;
  label: string;
  passed: boolean;
  blockedReason: string | null;
}

export interface ConversationRelayReadiness {
  ready: boolean;
  passedGateCount: number;
  totalGateCount: number;
  gates: ConversationRelayReadinessGate[];
  blockedReasons: string[];
}

export function evaluateConversationRelayReadiness(
  state: ConversationRelayReadinessGateState,
): ConversationRelayReadiness {
  const gates = GATE_DEFINITIONS.map((definition) => {
    const passed = state[definition.key];
    return {
      key: definition.key,
      label: definition.label,
      passed,
      blockedReason: passed ? null : definition.blockedReason,
    };
  });
  const blockedReasons = gates.flatMap((gate) =>
    gate.blockedReason === null ? [] : [gate.blockedReason],
  );
  return {
    ready: blockedReasons.length === 0,
    passedGateCount: gates.length - blockedReasons.length,
    totalGateCount: gates.length,
    gates,
    blockedReasons,
  };
}
