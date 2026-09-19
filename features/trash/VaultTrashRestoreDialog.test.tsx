import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { VaultTrashRestoreDialog } from "./VaultTrashRestoreDialog";
import type { TrashItem, VaultRecoveryPreview } from "./service";
import type { VaultRestoreResult } from "@/features/secrets/vault-service";
import {
  confirmVaultPasswordIdentity,
  getVaultExportActor,
  restoreVaultItem,
  VaultIdentityConfirmationError,
  VaultRestoreTransportError,
} from "@/features/secrets/vault-service";

const actor = {
  userId: "user-1",
  organizationId: "11111111-1111-4111-8111-111111111111",
  email: "admin@admin.com",
};
let selectedOrganization = actor.organizationId;
let authListener:
  | ((event: string, session?: { user: { id: string } } | null) => void)
  | undefined;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => selectedOrganization,
}));
jest.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (listener: typeof authListener) => {
        authListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  }),
}));
jest.mock("@/features/secrets/vault-service", () => ({
  getVaultExportActor: jest.fn(),
  restoreVaultItem: jest.fn(),
  confirmVaultPasswordIdentity: jest.fn(),
  VaultIdentityConfirmationError: class VaultIdentityConfirmationError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
  VaultRestoreTransportError: class VaultRestoreTransportError extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));

const getActorMock = jest.mocked(getVaultExportActor);
const confirmMock = jest.mocked(confirmVaultPasswordIdentity);
const restoreMock = jest.mocked(restoreVaultItem);
const itemId = "item-1";
const item: TrashItem = {
  artifact_kind: "credential_item",
  deleted_at: "2026-09-19T00:00:00.000Z",
  id: itemId,
  entity_token: "credential_item",
  is_mine: true,
  label: "Credential",
  organization_id: actor.organizationId,
  title: "Example credential",
};
const supportedPreview: VaultRecoveryPreview = {
  deletion_id: "00000000-0000-4000-8000-000000000001",
  fields_count: 2,
  attachments_count: 1,
  native_passkeys_count: 0,
  prior_was_disabled: false,
  supported: true,
  reason: null,
};

const restoredResult: VaultRestoreResult = {
  restored_fields: 2,
  restored_attachments: 1,
  restored_native_passkeys: 0,
  already_restored: false,
  notice: "sharing_and_automatic_use_off",
};

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`${text} missing`);
  return found;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("VaultTrashRestoreDialog", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onRestored = jest.fn();
  const onOpenChange = jest.fn();

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    selectedOrganization = actor.organizationId;
    authListener = undefined;
    onRestored.mockReset();
    onOpenChange.mockReset();
    getActorMock.mockReset();
    confirmMock.mockReset();
    restoreMock.mockReset();
    getActorMock.mockResolvedValue(actor);
    restoreMock.mockResolvedValue(restoredResult);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function render(preview: VaultRecoveryPreview = supportedPreview) {
    await act(async () => {
      root.render(
        <VaultTrashRestoreDialog
          item={item}
          preview={preview}
          actor={actor}
          open
          onOpenChange={onOpenChange}
          onRestored={onRestored}
        />,
      );
    });
    await act(async () => undefined);
  }

  test("unsupported recovery never offers or sends restore", async () => {
    await render({
      deletion_id: "00000000-0000-4000-8000-000000000001",
      fields_count: null,
      attachments_count: null,
      native_passkeys_count: null,
      prior_was_disabled: true,
      supported: false,
      reason: "protected_component_requires_native_recovery",
    });
    expect(document.body.textContent).toContain(
      "cannot be restored automatically yet",
    );
    expect(() => button("Restore disabled credential")).toThrow();
    expect(restoreMock).not.toHaveBeenCalled();
  });

  test("requires explicit quarantine confirmation before restore", async () => {
    await render();
    expect(document.body.textContent).toContain(
      "Restored fields stay inactive",
    );
    await act(async () => button("Restore disabled credential").click());
    expect(restoreMock).toHaveBeenCalledWith(
      item.id,
      supportedPreview.deletion_id,
      actor,
      expect.any(AbortSignal),
    );
    expect(onRestored).toHaveBeenCalledWith(
      item,
      expect.objectContaining({ already_restored: false }),
    );
  });

  test("shows the passkey count and keeps website acceptance separate", async () => {
    await render({
      ...supportedPreview,
      native_passkeys_count: 1,
    });
    expect(document.body.textContent).toContain("1 passkey, 2 fields");
    expect(document.body.textContent).toContain("does not reenable it");
    expect(document.body.textContent).toContain("website accepts it");
  });

  test("fresh-auth refusal opens identity confirmation without retrying", async () => {
    restoreMock.mockRejectedValue(
      new VaultRestoreTransportError("recent_auth_required"),
    );
    await render();
    await act(async () => button("Restore disabled credential").click());
    expect(document.querySelector("#vault-restore-password")).toBeInstanceOf(
      HTMLInputElement,
    );
    expect(restoreMock).toHaveBeenCalledTimes(1);
  });

  async function requestIdentityConfirmation() {
    restoreMock.mockRejectedValueOnce(
      new VaultRestoreTransportError("recent_auth_required"),
    );
    await render();
    await act(async () => button("Restore disabled credential").click());
    const password = document.querySelector("#vault-restore-password");
    if (!(password instanceof HTMLInputElement))
      throw new Error("password missing");
    password.value = "test-only-password";
  }

  test("keeps Trash confirmation open when credentials are rejected", async () => {
    await requestIdentityConfirmation();
    confirmMock.mockRejectedValueOnce(
      new VaultIdentityConfirmationError("credentials_rejected"),
    );
    await act(async () => button("Confirm identity").click());
    expect(document.querySelector("#vault-restore-password")).toBeInstanceOf(
      HTMLInputElement,
    );
    expect(document.body.textContent).toContain(
      "That password could not confirm your identity",
    );
  });

  async function expectIdentityFailureInvalidatesTrash(
    code: "context_changed" | "identity_unverified",
  ) {
    await requestIdentityConfirmation();
    confirmMock.mockRejectedValueOnce(new VaultIdentityConfirmationError(code));
    await act(async () => button("Confirm identity").click());
    expect(document.querySelector("#vault-restore-password")).toBeNull();
    expect(button("Restore disabled credential").disabled).toBe(true);
    expect(document.body.textContent).toContain("Review this credential again");
  }

  test("invalidates Trash recovery after pre-confirmation context failure", async () => {
    await expectIdentityFailureInvalidatesTrash("context_changed");
  });

  test("invalidates Trash recovery after post-confirmation identity failure", async () => {
    await expectIdentityFailureInvalidatesTrash("identity_unverified");
  });

  test("invalidates Trash recovery after a missing password AMR", async () => {
    await expectIdentityFailureInvalidatesTrash("identity_unverified");
  });

  test("an organization change before confirmation fences the restore", async () => {
    await render();
    selectedOrganization = "22222222-2222-4222-8222-222222222222";
    await render();
    await act(async () => button("Restore disabled credential").click());
    expect(restoreMock).not.toHaveBeenCalled();
  });

  test("an organization change during restore aborts the late response", async () => {
    const pending = deferred<VaultRestoreResult>();
    restoreMock.mockReturnValue(pending.promise);
    await render();
    await act(async () => button("Restore disabled credential").click());
    const signal = restoreMock.mock.calls[0]?.[3];
    selectedOrganization = "22222222-2222-4222-8222-222222222222";
    await render();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(restoredResult));
    expect(onRestored).not.toHaveBeenCalled();
  });

  test("an unknown response retries the exact same deletion ID", async () => {
    restoreMock
      .mockRejectedValueOnce(new VaultRestoreTransportError("retryable"))
      .mockResolvedValueOnce({
        ...restoredResult,
        already_restored: true,
      });
    await render();
    await act(async () => button("Restore disabled credential").click());
    expect(document.body.textContent).toContain("retryable");
    await act(async () => button("Restore disabled credential").click());
    expect(restoreMock.mock.calls.map((call) => call[1])).toEqual([
      supportedPreview.deletion_id,
      supportedPreview.deletion_id,
    ]);
    expect(onRestored).toHaveBeenCalledTimes(1);
  });
});
