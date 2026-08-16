import type { Tables } from "@/types/database.types";
import { isJsonObject } from "@/types/json";

import {
  evaluateVoiceStorageCanaryReceipt,
  OWNER_BETA_VOICE_STORAGE_POLICY,
  VOICE_STORAGE_CANARY_FAILED_ACTION,
  VOICE_STORAGE_CANARY_PASSED_ACTION,
} from "./storage-canary-readiness";

type ActivityRow = Pick<
  Tables<{ schema: "platform" }, "activity_log">,
  | "action"
  | "entity_id"
  | "entity_type"
  | "id"
  | "metadata"
  | "occurred_at"
  | "organization_id"
>;

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const COMPLETED_AT = "2026-08-16T20:00:00.000Z";

function passedReceipt(): ActivityRow {
  return {
    id: 123,
    action: VOICE_STORAGE_CANARY_PASSED_ACTION,
    entity_id: RUN_ID,
    entity_type: "voice_recording_storage_canary",
    occurred_at: COMPLETED_AT,
    organization_id: OWNER_BETA_VOICE_STORAGE_POLICY.organizationId,
    metadata: {
      evidence_version: 1,
      program_key: "ai_matrx_owner_beta",
      bucket: OWNER_BETA_VOICE_STORAGE_POLICY.bucket,
      allowed_prefix: OWNER_BETA_VOICE_STORAGE_POLICY.allowedPrefix,
      expected_writer_arn: OWNER_BETA_VOICE_STORAGE_POLICY.writerArn,
      writer_arn: OWNER_BETA_VOICE_STORAGE_POLICY.writerArn,
      writer_principal_id_hash: "a".repeat(64),
      writer_credential_fingerprint: "b".repeat(64),
      object_key_hash: "c".repeat(64),
      sentinel_sha256: "d".repeat(64),
      run_id: RUN_ID,
      completed_at: COMPLETED_AT,
      retention_policy: "voice_recordings_30d",
      custody_receipt_id: "22222222-2222-4222-8222-222222222222",
      adoption_receipt_id: "33333333-3333-4333-8333-333333333333",
      read_receipt_id: "44444444-4444-4444-8444-444444444444",
      delete_receipt_id: "55555555-5555-4555-8555-555555555555",
      writer_identity_exact: true,
      writer_put_succeeded: true,
      writer_read_denied: true,
      writer_delete_denied: true,
      writer_outside_prefix_put_denied: true,
      writer_object_list_denied: true,
      application_head_read_hash_succeeded: true,
      canonical_file_indexed: true,
      canonical_file_deleted: true,
    },
  };
}

describe("Voice storage canary readiness", () => {
  test("accepts only a fresh exact passed receipt", () => {
    expect(
      evaluateVoiceStorageCanaryReceipt(
        passedReceipt(),
        new Date("2026-08-16T21:00:00.000Z"),
      ),
    ).toEqual({
      ready: true,
      status: "ready",
      evidenceId: 123,
      completedAt: COMPLETED_AT,
      validUntil: "2026-08-17T20:00:00.000Z",
    });
  });

  test("expires an otherwise valid receipt after 24 hours", () => {
    expect(
      evaluateVoiceStorageCanaryReceipt(
        passedReceipt(),
        new Date("2026-08-17T20:00:00.001Z"),
      ),
    ).toMatchObject({ ready: false, status: "stale", evidenceId: 123 });
  });

  test("a latest failed outcome closes the storage gates", () => {
    const receipt = passedReceipt();
    receipt.action = VOICE_STORAGE_CANARY_FAILED_ACTION;

    expect(evaluateVoiceStorageCanaryReceipt(receipt)).toMatchObject({
      ready: false,
      status: "failed",
      evidenceId: 123,
    });
  });

  test.each([
    ["wrong writer", "writer_arn", "arn:aws:iam::872515272894:user/another"],
    ["missing denial", "writer_read_denied", false],
    ["wrong retention", "retention_policy", "forever"],
    ["malformed receipt", "delete_receipt_id", "not-a-uuid"],
  ])("rejects %s evidence", (_label, key, value) => {
    const receipt = passedReceipt();
    if (!isJsonObject(receipt.metadata)) {
      throw new Error("Fixture metadata must be an object");
    }
    receipt.metadata[key] = value;

    expect(evaluateVoiceStorageCanaryReceipt(receipt)).toMatchObject({
      ready: false,
      status: "invalid",
      evidenceId: 123,
    });
  });

  test("never exposes credential fingerprints, writer identity, or object paths", () => {
    const result = evaluateVoiceStorageCanaryReceipt(
      passedReceipt(),
      new Date("2026-08-16T21:00:00.000Z"),
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("writer");
    expect(serialized).not.toContain("bucket");
    expect(serialized).not.toContain("prefix");
    expect(serialized).not.toContain("s3://");
  });
});
