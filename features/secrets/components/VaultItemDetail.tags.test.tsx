import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => "org-test",
}));
jest.mock("@/features/organizations/hooks", () => ({
  useUserOrganizations: () => ({ organizations: [], loading: false }),
}));

const successToast = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    error: jest.fn(),
    success: (...args: unknown[]) => successToast(...args),
  },
}));

import { VaultItemDetail } from "./VaultItemDetail";
import type { VaultActions } from "../vault-hooks";
import type { VaultItem } from "../types";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const unavailable = async (): Promise<never> => {
  throw new Error("Unexpected vault action");
};
const updateItem = jest.fn<
  ReturnType<VaultActions["updateItem"]>,
  Parameters<VaultActions["updateItem"]>
>();
const actions: VaultActions = {
  createItem: unavailable,
  createItemWithAttachments: unavailable,
  importEnv: unavailable,
  updateItem,
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
  transfer: unavailable,
  fork: unavailable,
};

function item(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: "credential-1",
    display_name: "Payroll portal",
    definition_key: "env_value",
    definition_version: 1,
    status: "active",
    source: "manual",
    access_mode: "all_members",
    user_id: "user-1",
    organization_id: null,
    provider_key: null,
    description: "Monthly payroll access",
    tags: ["Finance, payroll", "Matrx", "日本語"],
    lifecycle: {},
    login_urls: [],
    uri_match_mode: "host",
    notes: null,
    non_secret_fields: [],
    browser_fill_enabled: false,
    fields: [],
    attachments: [],
    capabilities: {
      can_use: true,
      can_edit: true,
      can_reveal: true,
      can_manage: true,
    },
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (node): node is HTMLButtonElement =>
      node instanceof HTMLButtonElement &&
      (node.textContent?.trim() === text ||
        node.getAttribute("aria-label") === text),
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

function input(id: string): HTMLInputElement {
  const found = document.querySelector(id);
  if (!(found instanceof HTMLInputElement))
    throw new Error(`Missing input: ${id}`);
  return found;
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

describe("VaultItemDetail credential tags", () => {
  let host: HTMLDivElement;
  let root: Root;
  let currentItem: VaultItem;

  async function render(nextItem = currentItem) {
    currentItem = nextItem;
    await act(async () => {
      root.render(
        <VaultItemDetail
          item={currentItem}
          principal={{ type: "user" }}
          definitions={new Map()}
          busy={false}
          actions={actions}
          onClose={jest.fn()}
        />,
      );
    });
  }

  async function openEditor() {
    await act(async () => button("Edit credential").click());
  }

  beforeEach(() => {
    updateItem.mockReset();
    updateItem.mockResolvedValue(item());
    successToast.mockReset();
    currentItem = item();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  test("does not patch tags when saving an unrelated rename", async () => {
    await render();
    expect(host.textContent).toContain("Finance, payroll");
    expect(host.textContent).toContain("日本語");
    await openEditor();
    await change(input("#credential-name-credential-1"), "Payroll portal 2026");
    await act(async () => button("Save credential").click());

    expect(updateItem).toHaveBeenCalledWith("credential-1", {
      display_name: "Payroll portal 2026",
    });
  });

  test("adds, removes, and clears the editable tag draft before saving", async () => {
    await render();
    await openEditor();
    const tagInput = input("#credential-tag-credential-1");
    await change(tagInput, "  Year end  ");
    await act(async () =>
      tagInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(host.textContent).toContain("Year end");

    const remove = document.querySelector('[aria-label="Remove tag Matrx"]');
    if (!(remove instanceof HTMLButtonElement))
      throw new Error("Missing tag removal control");
    await act(async () => remove.click());
    expect(host.textContent).not.toContain("Matrx");

    await act(async () => button("Clear tags").click());
    await act(async () => button("Save credential").click());
    expect(updateItem).toHaveBeenLastCalledWith("credential-1", {
      tags: [],
    });
  });

  test("rejects blank and exact duplicate tags while accepting case and commas as entered", async () => {
    await render(item({ tags: ["Matrx"] }));
    await openEditor();
    const tagInput = input("#credential-tag-credential-1");
    await change(tagInput, "   ");
    expect(button("Add tag").disabled).toBe(true);
    await change(tagInput, " Matrx ");
    expect(button("Add tag").disabled).toBe(true);
    await change(tagInput, "matrx");
    await act(async () => button("Add tag").click());
    await change(tagInput, "ops, finance");
    await act(async () => button("Add tag").click());

    await act(async () => button("Save credential").click());
    expect(updateItem).toHaveBeenLastCalledWith("credential-1", {
      tags: ["Matrx", "matrx", "ops, finance"],
    });
  });

  test("shows tag chips but no tag editor to a viewer without edit authority", async () => {
    await render(
      item({
        capabilities: {
          can_use: true,
          can_edit: false,
          can_reveal: false,
          can_manage: false,
        },
      }),
    );

    expect(host.querySelector('[aria-label="Credential tags"]')).not.toBeNull();
    expect(host.textContent).toContain("Finance, payroll");
    expect(host.textContent).not.toContain("Edit credential");
    expect(host.querySelector("#credential-tag-credential-1")).toBeNull();
  });

  test("patches only tags when a tag edit leaves unusual metadata untouched", async () => {
    await render(
      item({
        display_name: "  Payroll — 日本語  ",
        description: "  Keep these exact spaces  ",
        tags: ["Finance, payroll"],
      }),
    );
    await openEditor();
    await change(input("#credential-tag-credential-1"), "  2026 close  ");
    await act(async () => button("Add tag").click());
    await act(async () => button("Save credential").click());

    expect(updateItem).toHaveBeenCalledWith("credential-1", {
      tags: ["Finance, payroll", "2026 close"],
    });
  });

  test("does not patch tags from a newer item refresh during a rename", async () => {
    await render(item({ tags: ["before"] }));
    await openEditor();
    await change(input("#credential-name-credential-1"), "Payroll 2026");
    await render(item({ tags: ["newer", "server tag"] }));
    await act(async () => button("Save credential").click());

    expect(updateItem).toHaveBeenCalledWith("credential-1", {
      display_name: "Payroll 2026",
    });
  });

  test("does not resend saved tags after a later external refresh and rename", async () => {
    await render(item({ tags: ["before"] }));
    await openEditor();
    await change(input("#credential-tag-credential-1"), "saved tag");
    await act(async () => button("Add tag").click());
    await act(async () => button("Save credential").click());
    expect(updateItem).toHaveBeenLastCalledWith("credential-1", {
      tags: ["before", "saved tag"],
    });

    await render(item({ tags: ["external tag"] }));
    await change(
      input("#credential-name-credential-1"),
      "Payroll after refresh",
    );
    await act(async () => button("Save credential").click());

    expect(updateItem).toHaveBeenLastCalledWith("credential-1", {
      display_name: "Payroll after refresh",
    });
  });

  test("keeps the tag draft after a failed save without reporting success", async () => {
    updateItem.mockRejectedValueOnce(new Error("Vault unavailable"));
    await render();
    await openEditor();
    const tagInput = input("#credential-tag-credential-1");
    await change(tagInput, "Retry tag");
    await act(async () => button("Add tag").click());
    await act(async () => button("Save credential").click());

    expect(input("#credential-tag-credential-1").value).toBe("");
    expect(host.textContent).toContain("Retry tag");
    expect(successToast).not.toHaveBeenCalled();
  });
});
