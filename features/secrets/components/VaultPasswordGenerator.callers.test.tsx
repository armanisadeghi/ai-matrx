import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { VaultCreateDialog } from "./VaultCreateDialog";
import { VaultItemDetail } from "./VaultItemDetail";
import type { VaultActions } from "../vault-hooks";
import type {
  CredentialDefinition,
  VaultField,
  VaultItem,
  VaultPrincipal,
} from "../types";

let actor = { userId: "user-1", organizationId: "org-1" };
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: { name: string }) =>
    selector.name === "selectUserId" ? actor.userId : actor.organizationId,
}));
jest.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => false }));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [] }),
}));
jest.mock("../generator-limits", () => ({
  fetchVaultGeneratorLimits: jest
    .fn()
    .mockResolvedValue({ maxPasswordLength: 1024, maxPassphraseWords: 64 }),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() },
}));

const definition: CredentialDefinition = {
  key: "website_login",
  payload: {
    label: "Website login",
    family: "generic",
    fields: [
      {
        field_key: "password",
        label: "Password",
        handling: "revealable",
        editable: true,
      },
    ],
  },
};
const noop = async (): Promise<void> => undefined;
const updateFieldValue = jest.fn(async (): Promise<void> => undefined);
function field(overrides: Partial<VaultField> = {}): VaultField {
  return {
    id: "field-1",
    credential_item_id: "item-1",
    field_key: "password",
    execution_purpose: undefined,
    env_key: null,
    handling: "revealable",
    editable: true,
    inject_into_sandbox: false,
    value_hint: "",
    value_version: 1,
    is_active: true,
    description: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}
function item(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: "item-1",
    display_name: "Example",
    description: null,
    definition_key: "website_login",
    definition_version: 1,
    status: "active",
    source: "manual",
    access_mode: "all_members",
    user_id: "user-1",
    organization_id: null,
    provider_key: null,
    tags: [],
    lifecycle: {},
    login_urls: [],
    uri_match_mode: "host",
    notes: null,
    non_secret_fields: [],
    browser_fill_enabled: false,
    attachments: [],
    fields: [field()],
    capabilities: {
      can_use: true,
      can_edit: true,
      can_reveal: true,
      can_manage: true,
    },
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}
const actions: VaultActions = {
  createItem: async () => item(),
  createItemWithAttachments: async () => item(),
  importEnv: async () => 0,
  updateItem: async () => item(),
  deleteItem: noop,
  addAttachment: noop,
  updateAttachment: noop,
  replaceAttachment: noop,
  deleteAttachment: noop,
  downloadAttachment: noop,
  addField: noop,
  updateFieldValue,
  deleteField: noop,
  setInject: noop,
  updateFieldMeta: noop,
  rotate: noop,
  setAccessMode: noop,
  addGrant: async () => ({}) as Awaited<ReturnType<VaultActions["addGrant"]>>,
  updateGrant: async () =>
    ({}) as Awaited<ReturnType<VaultActions["updateGrant"]>>,
  removeGrant: noop,
  giveOwnership: async () =>
    ({}) as Awaited<ReturnType<VaultActions["giveOwnership"]>>,
  assign: async () => ({}) as Awaited<ReturnType<VaultActions["assign"]>>,
  transfer: noop,
  fork: noop,
};
function buttons(text: string) {
  return [...document.querySelectorAll("button")].filter(
    (node): node is HTMLButtonElement =>
      node instanceof HTMLButtonElement && node.textContent?.trim() === text,
  );
}
function buttonContaining(text: string) {
  return (
    [...document.querySelectorAll("button")].find(
      (node): node is HTMLButtonElement =>
        node instanceof HTMLButtonElement && node.textContent?.includes(text),
    ) ?? null
  );
}
function input(selector: string): HTMLInputElement {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLInputElement))
    throw new Error(`Missing ${selector}`);
  return node;
}
async function change(node: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("Vault generator callers", () => {
  let host: HTMLDivElement;
  let root: Root;
  let principal: VaultPrincipal;
  const renderCreate = async () => {
    await act(async () =>
      root.render(
        <VaultCreateDialog
          open
          onOpenChange={jest.fn()}
          principal={principal}
          definitions={[definition]}
          busy={false}
          onCreate={async () => item()}
          onAssign={async () =>
            ({}) as Awaited<ReturnType<VaultActions["assign"]>>
          }
          initialDefinitionKey="website_login"
        />,
      ),
    );
  };
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    actor = { userId: "user-1", organizationId: "org-1" };
    updateFieldValue.mockClear();
    principal = { type: "user" };
    host = document.createElement("div");
    class ResizeObserverShim {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverShim,
    });
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  test.each([
    ["preset self", false, false],
    ["preset provided assignment", true, false],
    ["private assignment", true, true],
  ])(
    "renders generator only for %s",
    async (_name, assigning, privateGeneration) => {
      await renderCreate();
      if (assigning)
        await act(async () => buttons("For someone else")[0]?.click());
      if (privateGeneration)
        await act(async () => buttons("Generate privately")[0]?.click());
      expect(buttons("Generate")).toHaveLength(privateGeneration ? 0 : 1);
    },
  );
  test("uses a generated preset value in the masked parent input", async () => {
    await renderCreate();
    await act(async () => buttons("Generate")[0]?.click());
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Use")[0]?.click());
    const password = input("#vault-field-password");
    expect(password.value).toHaveLength(24);
    expect(password.type).toBe("password");
  });
  test.each([
    [
      "actor",
      () => {
        actor = { ...actor, userId: "user-2" };
      },
    ],
    [
      "organization",
      () => {
        actor = { ...actor, organizationId: "org-2" };
      },
    ],
    [
      "principal",
      () => {
        principal = { type: "organization", organizationId: "org-2" };
      },
    ],
  ])(
    "clears preset draft and candidate when %s changes",
    async (_name, mutate) => {
      await renderCreate();
      await act(async () => buttons("Generate")[0]?.click());
      await act(async () => buttons("Generate").at(-1)?.click());
      await act(async () => buttons("Use")[0]?.click());
      expect(input("#vault-field-password").value).toHaveLength(24);
      await act(async () => buttons("Generate")[0]?.click());
      await act(async () => buttons("Generate").at(-1)?.click());
      mutate();
      await renderCreate();
      expect(input("#vault-field-password").value).toBe("");
      expect(buttons("Use")).toHaveLength(0);
    },
  );
  test("clears preset draft for mode and recipient changes", async () => {
    await renderCreate();
    await change(input("#vault-field-password"), "manual-secret");
    await act(async () => buttons("For someone else")[0]?.click());
    expect(input("#vault-field-password").value).toBe("");
    await change(input("#vault-recipient-email"), "one@example.com");
    await change(input("#vault-field-password"), "manual-secret");
    await change(input("#vault-recipient-email"), "two@example.com");
    expect(input("#vault-field-password").value).toBe("");
  });
  test("Custom supports self and provided assignment but excludes private generation", async () => {
    await act(async () =>
      root.render(
        <VaultCreateDialog
          open
          onOpenChange={jest.fn()}
          principal={principal}
          definitions={[definition]}
          busy={false}
          onCreate={async () => item()}
          onAssign={async () =>
            ({}) as Awaited<ReturnType<VaultActions["assign"]>>
          }
        />,
      ),
    );
    await act(async () => buttonContaining("Custom credential")?.click());
    await change(input('input[placeholder="API login"]'), "password");
    expect(buttons("Generate")).toHaveLength(1);
    await act(async () => buttons("For someone else")[0]?.click());
    expect(buttons("Generate")).toHaveLength(1);
    await act(async () => buttons("Generate privately")[0]?.click());
    expect(buttons("Generate")).toHaveLength(0);
  });
  test("Custom field identity change clears its generated draft", async () => {
    await act(async () =>
      root.render(
        <VaultCreateDialog
          open
          onOpenChange={jest.fn()}
          principal={principal}
          definitions={[definition]}
          busy={false}
          onCreate={async () => item()}
          onAssign={async () =>
            ({}) as Awaited<ReturnType<VaultActions["assign"]>>
          }
        />,
      ),
    );
    await act(async () => buttonContaining("Custom credential")?.click());
    const fieldName = input('input[placeholder="API login"]');
    await change(fieldName, "password");
    await act(async () => buttons("Generate")[0]?.click());
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Use")[0]?.click());
    const value = input('input[placeholder="Paste the value"]');
    expect(value.value).toHaveLength(24);
    await change(fieldName, "token");
    expect(value.value).toBe("");
    expect(buttons("Generate")).toHaveLength(0);
  });
  test("Custom handling change clears its generated draft and generator", async () => {
    await act(async () =>
      root.render(
        <VaultCreateDialog
          open
          onOpenChange={jest.fn()}
          principal={principal}
          definitions={[definition]}
          busy={false}
          onCreate={async () => item()}
          onAssign={async () =>
            ({}) as Awaited<ReturnType<VaultActions["assign"]>>
          }
        />,
      ),
    );
    await act(async () => buttonContaining("Custom credential")?.click());
    await change(input('input[placeholder="API login"]'), "password");
    await act(async () => buttons("Generate")[0]?.click());
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Use")[0]?.click());
    const value = input('input[placeholder="Paste the value"]');
    await act(async () =>
      (
        document.querySelector(
          '[aria-label="Automation only"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(value.value).toBe("");
    expect(buttons("Generate")).toHaveLength(0);
  });
  test.each([
    [
      "actor",
      () => {
        actor = { ...actor, userId: "user-2" };
      },
    ],
    [
      "organization",
      () => {
        actor = { ...actor, organizationId: "org-2" };
      },
    ],
    [
      "principal",
      () => {
        principal = { type: "organization", organizationId: "org-2" };
      },
    ],
  ])(
    "Custom clears a generated draft when %s changes",
    async (_name, mutate) => {
      await act(async () =>
        root.render(
          <VaultCreateDialog
            open
            onOpenChange={jest.fn()}
            principal={principal}
            definitions={[definition]}
            busy={false}
            onCreate={async () => item()}
            onAssign={async () =>
              ({}) as Awaited<ReturnType<VaultActions["assign"]>>
            }
          />,
        ),
      );
      await act(async () => buttonContaining("Custom credential")?.click());
      await change(input('input[placeholder="API login"]'), "password");
      await act(async () => buttons("Generate")[0]?.click());
      await act(async () => buttons("Generate").at(-1)?.click());
      await act(async () => buttons("Use")[0]?.click());
      const value = input('input[placeholder="Paste the value"]');
      expect(value.value).toHaveLength(24);
      mutate();
      await act(async () =>
        root.render(
          <VaultCreateDialog
            open
            onOpenChange={jest.fn()}
            principal={principal}
            definitions={[definition]}
            busy={false}
            onCreate={async () => item()}
            onAssign={async () =>
              ({}) as Awaited<ReturnType<VaultActions["assign"]>>
            }
          />,
        ),
      );
      expect(input('input[placeholder="Paste the value"]').value).toBe("");
    },
  );
  test.each([
    ["wrong field", field({ field_key: "token" })],
    ["inactive", field({ is_active: false })],
    ["noneditable", field({ editable: false })],
    ["sealed", field({ handling: "sealed" })],
    ["protected", field({ execution_purpose: "passkey_private" })],
    ["permission", field()],
  ])("edit row excludes generator for %s", async (name, editedField) => {
    const edited = item({
      fields: [editedField],
      capabilities:
        name === "permission"
          ? {
              can_use: true,
              can_edit: false,
              can_reveal: true,
              can_manage: true,
            }
          : item().capabilities,
    });
    await act(async () =>
      root.render(
        <VaultItemDetail
          item={edited}
          principal={{ type: "user" }}
          definitions={new Map()}
          busy={false}
          actions={actions}
          onClose={jest.fn()}
        />,
      ),
    );
    if (buttons("Edit credential").length)
      await act(async () => buttons("Edit credential")[0]?.click());
    const edit = document.querySelector(
      '[aria-label="Edit Password"]',
    ) as HTMLButtonElement | null;
    if (edit) await act(async () => edit.click());
    expect(buttons("Generate")).toHaveLength(0);
  });

  test("uses a generated value in an authorized edit draft without saving", async () => {
    await act(async () =>
      root.render(
        <VaultItemDetail
          item={item()}
          principal={{ type: "user" }}
          definitions={new Map()}
          busy={false}
          actions={actions}
          onClose={jest.fn()}
        />,
      ),
    );
    await act(async () => buttons("Edit credential")[0]?.click());
    await act(async () =>
      (
        document.querySelector(
          '[aria-label="Edit Password"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(buttons("Generate")).toHaveLength(1);
    await act(async () => buttons("Generate")[0]?.click());
    await act(async () => buttons("Generate").at(-1)?.click());
    await act(async () => buttons("Reveal")[0]?.click());
    const candidate = [...document.querySelectorAll("p")]
      .map((node) => node.textContent ?? "")
      .find((value) => /^[^•]{24}$/.test(value));
    if (!candidate) throw new Error("Missing revealed edit candidate");
    await act(async () => buttons("Use")[0]?.click());
    const draft = input('[aria-label="New value for Password"]');
    expect(draft.type).toBe("password");
    expect(draft.value).toBe(candidate);
    expect(updateFieldValue).not.toHaveBeenCalled();
  });
  test.each([
    [
      "actor",
      (current: VaultItem) => {
        actor = { ...actor, userId: "user-2" };
        return current;
      },
    ],
    [
      "organization",
      (current: VaultItem) => {
        actor = { ...actor, organizationId: "org-2" };
        return current;
      },
    ],
    [
      "item",
      (current: VaultItem) =>
        item({
          ...current,
          id: "item-2",
          fields: [field({ id: "field-2", credential_item_id: "item-2" })],
        }),
    ],
    [
      "field",
      (current: VaultItem) =>
        item({ ...current, fields: [field({ id: "field-2" })] }),
    ],
    [
      "inactive",
      (current: VaultItem) =>
        item({ ...current, fields: [field({ is_active: false })] }),
    ],
    [
      "noneditable",
      (current: VaultItem) =>
        item({ ...current, fields: [field({ editable: false })] }),
    ],
    [
      "sealed",
      (current: VaultItem) =>
        item({ ...current, fields: [field({ handling: "sealed" })] }),
    ],
    [
      "protected",
      (current: VaultItem) =>
        item({
          ...current,
          fields: [field({ execution_purpose: "passkey_private" })],
        }),
    ],
    [
      "capability",
      (current: VaultItem) =>
        item({
          ...current,
          capabilities: { ...current.capabilities, can_edit: false },
        }),
    ],
  ])("clears actual edit draft when %s changes", async (_name, transition) => {
    let current = item();
    await act(async () =>
      root.render(
        <VaultItemDetail
          item={current}
          principal={{ type: "user" }}
          definitions={new Map()}
          busy={false}
          actions={actions}
          onClose={jest.fn()}
        />,
      ),
    );
    await act(async () => buttons("Edit credential")[0]?.click());
    await act(async () =>
      (
        document.querySelector(
          '[aria-label="Edit Password"]',
        ) as HTMLButtonElement
      ).click(),
    );
    await change(
      input('[aria-label="New value for Password"]'),
      "manual-secret",
    );
    current = transition(current);
    await act(async () =>
      root.render(
        <VaultItemDetail
          item={current}
          principal={{ type: "user" }}
          definitions={new Map()}
          busy={false}
          actions={actions}
          onClose={jest.fn()}
        />,
      ),
    );
    expect(
      document.querySelector('[aria-label="New value for Password"]'),
    ).toBeNull();
  });
});
