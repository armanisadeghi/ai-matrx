const rpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc } }));

import {
  isVaultOwnedTrashToken,
  parseVaultRecoveryPreview,
  previewVaultRecovery,
  restoreFromTrash,
} from "./service";

describe("Trash restore routing", () => {
  beforeEach(() => rpc.mockReset());

  test("ordinary Trash items retain the generic undelete RPC", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await restoreFromTrash("notes", "ordinary-item");
    expect(rpc).toHaveBeenCalledWith("entity_undelete", {
      p_token: "notes",
      p_id: "ordinary-item",
    });
  });

  test.each(["credential_item", "user_secret", "credential_attachment"])(
    "marks %s as unavailable to generic bulk Keep",
    (token) => expect(isVaultOwnedTrashToken(token)).toBe(true),
  );

  test("accepts only coherent value-free recovery metadata", async () => {
    rpc.mockResolvedValue({
      data: {
        deletion_id: "00000000-0000-4000-8000-000000000001",
        fields_count: 2,
        attachments_count: 1,
        native_passkeys_count: 1,
        prior_was_disabled: false,
        supported: true,
        reason: null,
      },
      error: null,
    });
    await expect(
      previewVaultRecovery("credential-item"),
    ).resolves.toMatchObject({
      supported: true,
      fields_count: 2,
      native_passkeys_count: 1,
    });
  });

  test.each([
    [
      "tracking unavailable",
      { supported: false, reason: "recovery_tracking_unavailable" },
      "recovery_tracking_unavailable",
    ],
    [
      "unsupported manifest",
      { supported: false, reason: "recovery_manifest_unsupported" },
      "recovery_manifest_unsupported",
    ],
    [
      "protected component",
      {
        deletion_id: "00000000-0000-4000-8000-000000000001",
        prior_was_disabled: true,
        supported: false,
        reason: "protected_component_requires_native_recovery",
      },
      "protected_component_requires_native_recovery",
    ],
    [
      "linked component",
      {
        deletion_id: "00000000-0000-4000-8000-000000000001",
        prior_was_disabled: false,
        supported: false,
        reason: "linked_component_requires_native_recovery",
      },
      "linked_component_requires_native_recovery",
    ],
  ])(
    "normalizes the sparse producer shape for %s",
    async (_label, data, reason) => {
      rpc.mockResolvedValue({ data, error: null });

      await expect(previewVaultRecovery("credential-item")).resolves.toEqual({
        supported: false,
        deletion_id: "deletion_id" in data ? data.deletion_id : null,
        fields_count: null,
        attachments_count: null,
        native_passkeys_count: null,
        prior_was_disabled:
          "prior_was_disabled" in data ? data.prior_was_disabled : null,
        reason,
      });
    },
  );

  test("rejects an incoherent unsupported recovery preview", async () => {
    rpc.mockResolvedValue({
      data: {
        deletion_id: "00000000-0000-4000-8000-000000000001",
        fields_count: -1,
        attachments_count: 0,
        prior_was_disabled: false,
        supported: false,
        reason: null,
      },
      error: null,
    });
    await expect(previewVaultRecovery("credential-item")).rejects.toThrow(
      "Recovery details were incomplete",
    );
  });

  test("accepts an absent native count only as the installed ordinary v1 shape", () => {
    expect(
      parseVaultRecoveryPreview({
        deletion_id: "00000000-0000-4000-8000-000000000001",
        fields_count: 0,
        attachments_count: 0,
        prior_was_disabled: false,
        supported: true,
        reason: null,
      }),
    ).toMatchObject({ supported: true, native_passkeys_count: 0 });
  });

  test.each([
    { native_passkeys_count: -1 },
    { native_passkeys_count: 2 },
    { native_passkeys_count: "1" },
    { native_passkeys_count: 1, fields_count: 0 },
  ])("rejects an invalid native count shape: %o", (override) => {
    expect(() =>
      parseVaultRecoveryPreview({
        deletion_id: "00000000-0000-4000-8000-000000000001",
        fields_count: 1,
        attachments_count: 0,
        prior_was_disabled: false,
        supported: true,
        reason: null,
        ...override,
      }),
    ).toThrow("Recovery details were incomplete");
  });

  test.each([
    "native_recovery_unavailable",
    "native_components_missing",
    "native_components_conflict",
    "native_manifest_invalid",
  ])("accepts the exact sparse native refusal envelope for %s", (reason) => {
    expect(
      parseVaultRecoveryPreview({
        deletion_id: "00000000-0000-4000-8000-000000000001",
        native_passkeys_count: 0,
        prior_was_disabled: false,
        supported: false,
        reason,
      }),
    ).toEqual({
      deletion_id: "00000000-0000-4000-8000-000000000001",
      fields_count: null,
      attachments_count: null,
      native_passkeys_count: 0,
      prior_was_disabled: false,
      supported: false,
      reason,
    });
  });

  test("rejects a native count of one in an unsupported recovery envelope", () => {
    expect(() =>
      parseVaultRecoveryPreview({
        deletion_id: "00000000-0000-4000-8000-000000000001",
        native_passkeys_count: 1,
        prior_was_disabled: false,
        supported: false,
        reason: "native_recovery_unavailable",
      }),
    ).toThrow("Recovery details were incomplete");
  });
});
