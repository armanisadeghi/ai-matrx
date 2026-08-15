/** Fail-closed launch gates for disclosed AI Matrx call recording. */

const GATE_DEFINITIONS = [
  {
    key: "owner_only_program_bound",
    label: "Owner-only test program",
    blockedReason:
      "The callable number is not yet restricted to the explicitly approved internal test program.",
  },
  {
    key: "disclosure_and_consent_verified",
    label: "Disclosure and consent",
    blockedReason:
      "The exact recording disclosure and affirmative continuation behavior have not been verified.",
  },
  {
    key: "provider_email_verification_current",
    label: "Provider verification",
    blockedReason:
      "Twilio requires fresh account email verification before recording settings can be reviewed or changed.",
  },
  {
    key: "dedicated_storage_identity_ready",
    label: "Dedicated storage identity",
    blockedReason:
      "Twilio does not yet have a dedicated least-privilege S3 write identity limited to the recording bucket or prefix.",
  },
  {
    key: "external_storage_configured",
    label: "External storage configuration",
    blockedReason:
      "Voice Recording External Storage has not been configured for the exact Twilio account or subaccount and region.",
  },
  {
    key: "external_storage_canary_passed",
    label: "Storage write canary",
    blockedReason:
      "A non-recording write canary has not proven that the dedicated identity can create and AI Matrx can read and delete the expected object.",
  },
  {
    key: "lifecycle_persistence_ready",
    label: "Recording lifecycle persistence",
    blockedReason:
      "Signed recording callbacks cannot yet be durably claimed, deduplicated, correlated to a call, and finalized before acknowledgement.",
  },
  {
    key: "canonical_file_ingest_ready",
    label: "Canonical AI Matrx file ownership",
    blockedReason:
      "The external S3 object cannot yet be indexed as the canonical AI Matrx file linked to the call interaction.",
  },
  {
    key: "retention_access_deletion_ready",
    label: "Retention, access, and deletion",
    blockedReason:
      "The owner-only proof does not yet have an enforced retention period, audited access path, and verified deletion path.",
  },
] as const;

export type VoiceRecordingReadinessGateKey =
  (typeof GATE_DEFINITIONS)[number]["key"];

export type VoiceRecordingReadinessGateState = Record<
  VoiceRecordingReadinessGateKey,
  boolean
>;

export interface VoiceRecordingReadinessGate {
  key: VoiceRecordingReadinessGateKey;
  label: string;
  passed: boolean;
  blockedReason: string | null;
}

export interface VoiceRecordingReadiness {
  ready: boolean;
  passedGateCount: number;
  totalGateCount: number;
  gates: VoiceRecordingReadinessGate[];
  blockedReasons: string[];
}

/** Evaluate every launch gate explicitly; a missing or false gate blocks capture. */
export function evaluateVoiceRecordingReadiness(
  state: VoiceRecordingReadinessGateState,
): VoiceRecordingReadiness {
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
  const passedGateCount = gates.length - blockedReasons.length;
  return {
    ready: blockedReasons.length === 0,
    passedGateCount,
    totalGateCount: gates.length,
    gates,
    blockedReasons,
  };
}
