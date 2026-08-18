import type { Tables } from "@/types/database.types";
import { isJsonObject } from "@/types/json";

import {
  evaluateVoiceProviderConfigurationReceipt,
  OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY,
  VOICE_PROVIDER_CONFIGURATION_INVALIDATED_ACTION,
  VOICE_PROVIDER_CONFIGURATION_VERIFIED_ACTION,
} from "./provider-configuration-readiness";

type ActivityRow = Pick<
  Tables<{ schema: "platform" }, "activity_log">,
  | "action"
  | "actor_id"
  | "entity_id"
  | "entity_type"
  | "id"
  | "metadata"
  | "occurred_at"
  | "organization_id"
>;

const VERIFICATION_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL_VERIFIED_AT = "2026-08-17T22:50:00.000Z";
const CONFIGURATION_VERIFIED_AT = "2026-08-17T23:00:00.000Z";

function verifiedReceipt(): ActivityRow {
  return {
    id: 124,
    action: VOICE_PROVIDER_CONFIGURATION_VERIFIED_ACTION,
    actor_id: OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.operatorId,
    entity_id: VERIFICATION_ID,
    entity_type: "voice_recording_provider_configuration",
    occurred_at: CONFIGURATION_VERIFIED_AT,
    organization_id:
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.organizationId,
    metadata: {
      evidence_version: 1,
      verification_id: VERIFICATION_ID,
      program_key: "ai_matrx_owner_beta",
      provider: OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.provider,
      provider_account_fingerprint:
        OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.providerAccountFingerprint,
      provider_region:
        OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.providerRegion,
      storage_credential_fingerprint:
        OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.storageCredentialFingerprint,
      external_storage_url:
        OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.externalStorageUrl,
      email_verification_completed: true,
      email_verification_completed_at: EMAIL_VERIFIED_AT,
      external_storage_enabled: true,
      configuration_verified_at: CONFIGURATION_VERIFIED_AT,
      recording_capture_enabled: false,
    },
  };
}

describe("Voice provider-configuration readiness", () => {
  test("accepts a fresh exact operator verification", () => {
    expect(
      evaluateVoiceProviderConfigurationReceipt(
        verifiedReceipt(),
        new Date("2026-08-17T23:30:00.000Z"),
      ),
    ).toEqual({
      ready: true,
      status: "ready",
      evidenceId: 124,
      verifiedAt: CONFIGURATION_VERIFIED_AT,
      emailVerificationCurrent: true,
      externalStorageConfigured: true,
      emailVerificationValidUntil: "2026-08-18T22:50:00.000Z",
      configurationValidUntil: "2026-09-16T23:00:00.000Z",
    });
  });

  test("keeps configured storage visible when only email verification expires", () => {
    expect(
      evaluateVoiceProviderConfigurationReceipt(
        verifiedReceipt(),
        new Date("2026-08-19T00:00:00.000Z"),
      ),
    ).toMatchObject({
      ready: false,
      status: "email_verification_stale",
      emailVerificationCurrent: false,
      externalStorageConfigured: true,
    });
  });

  test("expires provider configuration after thirty days", () => {
    expect(
      evaluateVoiceProviderConfigurationReceipt(
        verifiedReceipt(),
        new Date("2026-09-16T23:00:00.001Z"),
      ),
    ).toMatchObject({
      ready: false,
      status: "configuration_stale",
      emailVerificationCurrent: false,
      externalStorageConfigured: false,
    });
  });

  test("a latest invalidation closes both provider gates", () => {
    const receipt = verifiedReceipt();
    receipt.action = VOICE_PROVIDER_CONFIGURATION_INVALIDATED_ACTION;

    expect(evaluateVoiceProviderConfigurationReceipt(receipt)).toMatchObject({
      ready: false,
      status: "invalidated",
      evidenceId: 124,
      emailVerificationCurrent: false,
      externalStorageConfigured: false,
    });
  });

  test.each([
    ["wrong operator", "row", "actor_id", "another-user"],
    [
      "wrong account",
      "metadata",
      "provider_account_fingerprint",
      "a".repeat(64),
    ],
    ["wrong region", "metadata", "provider_region", "IE1"],
    [
      "wrong credential",
      "metadata",
      "storage_credential_fingerprint",
      "b".repeat(64),
    ],
    ["wrong storage target", "metadata", "external_storage_url", "https://example.com"],
    ["email not completed", "metadata", "email_verification_completed", false],
    ["external storage off", "metadata", "external_storage_enabled", false],
    ["recording already on", "metadata", "recording_capture_enabled", true],
  ])("rejects %s evidence", (_label, target, key, value) => {
    const receipt = verifiedReceipt();
    if (target === "row") {
      receipt.actor_id = typeof value === "string" ? value : null;
    } else {
      if (!isJsonObject(receipt.metadata)) {
        throw new Error("Fixture metadata must be an object");
      }
      receipt.metadata[key] = value;
    }

    expect(evaluateVoiceProviderConfigurationReceipt(receipt)).toMatchObject({
      ready: false,
      status: "invalid",
      evidenceId: 124,
    });
  });

  test("never exposes provider, credential, account, or storage identifiers", () => {
    const result = evaluateVoiceProviderConfigurationReceipt(
      verifiedReceipt(),
      new Date("2026-08-17T23:30:00.000Z"),
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("twilio");
    expect(serialized).not.toContain(
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.providerAccountFingerprint,
    );
    expect(serialized).not.toContain(
      OWNER_BETA_VOICE_PROVIDER_CONFIGURATION_POLICY.storageCredentialFingerprint,
    );
    expect(serialized).not.toContain("amazonaws");
    expect(serialized).not.toContain("bucket");
  });
});
