import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const resolveVaultFields = jest.fn();
const revealVaultField = jest.fn();
const writeText = jest.fn();
let selectedOrganizationId = "org-a";
let authStateListener:
  | ((event: string, session?: { user: { id: string } } | null) => void)
  | null = null;

jest.mock("@/features/secrets/vault-service", () => ({
  resolveVaultFields: (...args: unknown[]) => resolveVaultFields(...args),
  revealVaultField: (...args: unknown[]) => revealVaultField(...args),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => selectedOrganizationId,
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (
        listener: (event: string, session?: { user: { id: string } } | null) => void,
      ) => {
        authStateListener = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  }),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn() },
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [], loading: false }),
}));
jest.mock("../authenticator-service", () => ({
  fetchAuthenticators: jest.fn(async () => []),
  enrollAuthenticator: jest.fn(),
  deleteAuthenticator: jest.fn(),
  setAuthenticatorEnabled: jest.fn(),
}));
jest.mock("../vault-hooks", () => ({
  ...jest.requireActual("../vault-hooks"),
  useVaultAudit: () => ({ entries: [], loading: false, error: null }),
  useVaultGrants: () => ({ grants: [], loading: false, error: null }),
}));

import { useFieldSecret } from "../components/SecretValue";
import { VaultItemDetail } from "../components/VaultItemDetail";
import type { VaultActions } from "../vault-hooks";
import type { VaultField, VaultItem, VaultPrincipal } from "../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const field: VaultField = {
  id: "field-a",
  credential_item_id: "item-a",
  field_key: "password",
  env_key: null,
  handling: "revealable",
  editable: true,
  inject_into_sandbox: false,
  value_hint: "",
  value_version: 1,
  is_active: true,
  description: null,
  created_at: "2026-09-12T00:00:00Z",
  updated_at: "2026-09-12T00:00:00Z",
};

function itemFor(nextField: VaultField): VaultItem {
  return {
    id: nextField.credential_item_id,
    display_name: "Lifecycle test credential",
    definition_key: "env_value",
    definition_version: 1,
    status: "active",
    source: "manual",
    access_mode: "all_members",
    user_id: "user-a",
    organization_id: null,
    provider_key: null,
    description: null,
    tags: [],
    lifecycle: {},
    login_urls: [],
    uri_match_mode: "host",
    notes: null,
    non_secret_fields: [],
    browser_fill_enabled: false,
    fields: [nextField],
    attachments: [],
    capabilities: {
      can_use: true,
      can_edit: true,
      can_reveal: true,
      can_manage: true,
    },
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
  };
}

const unavailable = async (): Promise<never> => {
  throw new Error("unexpected vault action");
};
const transfer = jest.fn(async (_itemId: string, _to: VaultPrincipal) => undefined);
const fork = jest.fn(async (_itemId: string, _to: VaultPrincipal) => undefined);
const actions: VaultActions = {
  createItem: unavailable,
  createItemWithAttachments: unavailable,
  importEnv: unavailable,
  updateItem: unavailable,
  deleteItem: unavailable,
  addAttachment: unavailable,
  updateAttachment: unavailable,
  replaceAttachment: unavailable,
  deleteAttachment: unavailable,
  downloadAttachment: unavailable,
  addField: unavailable,
  updateFieldValue: unavailable,
  deleteField: unavailable,
  setInject: unavailable,
  updateFieldMeta: unavailable,
  rotate: unavailable,
  setAccessMode: unavailable,
  addGrant: unavailable,
  updateGrant: unavailable,
  removeGrant: unavailable,
  giveOwnership: unavailable,
  assign: unavailable,
  transfer,
  fork,
};

let latest!: ReturnType<typeof useFieldSecret>;
let root: Root;
let host: HTMLDivElement;
let rootMounted = false;

function Probe({ item, field }: { item: VaultItem; field: VaultField }) {
  latest = useFieldSecret(item, field);
  return null;
}

function render(nextField = field) {
  root.render(<Probe item={itemFor(nextField)} field={nextField} />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  selectedOrganizationId = "org-a";
  authStateListener = null;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    rootMounted = true;
    render();
  });
});

afterEach(async () => {
  if (rootMounted) await act(async () => root.unmount());
  rootMounted = false;
  host.remove();
});

describe("useFieldSecret operation lifecycle", () => {
  test("does not copy a deferred old value after the mounted hook becomes protected", async () => {
    const oldValue = deferred<{ value: string }>();
    revealVaultField.mockReturnValueOnce(oldValue.promise);
    let copying!: Promise<void>;

    act(() => {
      copying = latest.copy();
    });
    act(() => {
      render({ ...field, execution_purpose: "passkey_private" });
    });
    await act(async () => {
      oldValue.resolve({ value: "old plaintext" });
      await copying;
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(latest.value).toBeNull();
  });

  test("does not hold a deferred reveal after the field version changes", async () => {
    const oldValue = deferred<{ value: string }>();
    revealVaultField.mockReturnValueOnce(oldValue.promise);
    let revealing!: Promise<boolean>;

    act(() => {
      revealing = latest.reveal();
    });
    act(() => {
      render({ ...field, value_version: 2 });
    });
    await act(async () => {
      oldValue.resolve({ value: "old plaintext" });
      await revealing;
    });

    expect(latest.value).toBeNull();
  });

  test("does not expose a deferred automatic visible value after revocation", async () => {
    const oldValue = deferred<Record<string, string>>();
    resolveVaultFields.mockReturnValueOnce(oldValue.promise);
    act(() => {
      render({ ...field, handling: "visible" });
    });
    act(() => {
      render({ ...field, handling: "visible", is_active: false });
    });
    await act(async () => {
      oldValue.resolve({ "item-a/password": "old plaintext" });
      await Promise.resolve();
    });

    expect(latest.value).toBeNull();
    expect(latest.allowed).toBe(false);
  });

  test("synchronously invalidates a deferred copy in the same auth-event batch", async () => {
    const oldValue = deferred<{ value: string }>();
    revealVaultField.mockReturnValueOnce(oldValue.promise);
    let copying!: Promise<void>;
    act(() => {
      copying = latest.copy();
    });
    await act(async () => {
      authStateListener?.("SIGNED_OUT");
      oldValue.resolve({ value: "old plaintext" });
      await copying;
    });

    expect(writeText).not.toHaveBeenCalled();
  });

  test("synchronously invalidates a deferred copy when SIGNED_IN replaces the actor", async () => {
    const oldValue = deferred<{ value: string }>();
    revealVaultField.mockReturnValueOnce(oldValue.promise);
    let copying!: Promise<void>;
    act(() => {
      copying = latest.copy();
    });
    await act(async () => {
      authStateListener?.("SIGNED_IN", { user: { id: "user-b" } });
      oldValue.resolve({ value: "old plaintext" });
      await copying;
    });

    expect(writeText).not.toHaveBeenCalled();
  });

  test("does not revoke a deferred copy for a same-actor token refresh", async () => {
    await act(async () => {
      authStateListener?.("INITIAL_SESSION", { user: { id: "user-a" } });
    });
    const oldValue = deferred<{ value: string }>();
    revealVaultField.mockReturnValueOnce(oldValue.promise);
    let copying!: Promise<void>;
    act(() => {
      copying = latest.copy();
    });
    await act(async () => {
      authStateListener?.("TOKEN_REFRESHED", { user: { id: "user-a" } });
      oldValue.resolve({ value: "old plaintext" });
      await copying;
    });

    expect(writeText).toHaveBeenCalledWith("old plaintext");
  });

  test("synchronously invalidates a deferred copy when auth reports no actor", async () => {
    const oldValue = deferred<{ value: string }>();
    revealVaultField.mockReturnValueOnce(oldValue.promise);
    let copying!: Promise<void>;
    act(() => {
      copying = latest.copy();
    });
    await act(async () => {
      authStateListener?.("SIGNED_IN", null);
      oldValue.resolve({ value: "old plaintext" });
      await copying;
    });

    expect(writeText).not.toHaveBeenCalled();
  });

  test("invalidates a deferred copy when a user manually clears the field", async () => {
    const oldValue = deferred<{ value: string }>();
    revealVaultField.mockReturnValueOnce(oldValue.promise);
    let copying!: Promise<void>;
    act(() => {
      copying = latest.copy();
      latest.clear();
    });
    await act(async () => {
      oldValue.resolve({ value: "old plaintext" });
      await copying;
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(latest.value).toBeNull();
  });

  test("invalidates a deferred copy when the hook unmounts", async () => {
    const oldValue = deferred<{ value: string }>();
    revealVaultField.mockReturnValueOnce(oldValue.promise);
    let copying!: Promise<void>;
    act(() => {
      copying = latest.copy();
    });
    await act(async () => root.unmount());
    rootMounted = false;
    await act(async () => {
      oldValue.resolve({ value: "old plaintext" });
      await copying;
    });

    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("VaultItemDetail protected-action lifecycle", () => {
  test("closes an open transfer panel before it can act after protected data arrives", async () => {
    await act(async () => {
      root.render(
        <VaultItemDetail
          item={itemFor(field)}
          principal={{ type: "user" }}
          definitions={new Map()}
          busy={false}
          actions={actions}
          onClose={jest.fn()}
        />,
      );
    });
    const more = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("More"),
    );
    expect(more).toBeDefined();
    await act(async () => {
      more?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });
    const transferAction = Array.from(
      document.querySelectorAll<HTMLElement>("[role=menuitem]"),
    ).find((entry) => entry.textContent?.includes("Move scope"));
    expect(transferAction).toBeDefined();
    await act(async () => transferAction?.click());
    expect(host.textContent).toContain("Move ownership without copying values");

    await act(async () => {
      root.render(
        <VaultItemDetail
          item={itemFor({ ...field, execution_purpose: "passkey_private" })}
          principal={{ type: "user" }}
          definitions={new Map()}
          busy={false}
          actions={actions}
          onClose={jest.fn()}
        />,
      );
    });

    expect(host.textContent).not.toContain("Move ownership without copying values");
    expect(transfer).not.toHaveBeenCalled();
    expect(fork).not.toHaveBeenCalled();
  });
});
