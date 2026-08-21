/**
 * The card IS the leak boundary (D-11), so these pin the invariants that make
 * it one: the typed values reach the vault write and NOTHING else, the receipt
 * that retires the card carries a status and an item id only, and a request the
 * agent has already given up on cannot write a credential at all.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CredentialCaptureCard } from "./CredentialCaptureCard";
import type { CredentialCaptureRequest } from "../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const postJson = jest.fn();
jest.mock("@/lib/python-client", () => ({
  postJson: (path: string, body: unknown) => postJson(path, body),
  getJson: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

function request(
  overrides: Partial<CredentialCaptureRequest> = {},
): CredentialCaptureRequest {
  return {
    handoffId: "ho_1",
    displayName: "Acme Admin",
    description: null,
    providerKey: null,
    loginUrl: "https://acme.example.com/login",
    host: "acme.example.com",
    submitSelector: "button[type='submit']",
    uriMatchMode: "host",
    branch: "unknown",
    guidance: "",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    fields: [
      {
        fieldKey: "username",
        selector: "#user",
        label: "Work email",
        secret: false,
        step: 0,
      },
      {
        fieldKey: "password",
        selector: "#pass",
        label: "Password",
        secret: true,
        step: 0,
      },
    ],
    ...overrides,
  };
}

async function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes(label),
    );
  return {
    container,
    button,
    text: () => container.textContent ?? "",
    input: (fieldKey: string) =>
      container.querySelector<HTMLInputElement>(
        `input[id$="-${fieldKey}"]`,
      ),
    async type(fieldKey: string, value: string) {
      const input = container.querySelector<HTMLInputElement>(
        `input[id$="-${fieldKey}"]`,
      );
      if (!input) throw new Error(`no input for ${fieldKey}`);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      await act(async () => {
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async click(label: string) {
      const btn = button(label);
      if (!btn) throw new Error(`no button matching "${label}"`);
      await act(async () => {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("CredentialCaptureCard", () => {
  beforeEach(() => {
    postJson.mockReset();
    postJson.mockResolvedValue({
      data: {
        status: "captured",
        proceed: true,
        credential_item_id: "item-9",
        propose_recipe: true,
      },
      meta: {},
    });
  });

  it("labels the boxes from the agent's field map and masks the secret one", async () => {
    const v = await render(
      <CredentialCaptureCard
        runId="run-1"
        profileId="prof-1"
        request={request()}
        onSettled={jest.fn()}
      />,
    );
    expect(v.text()).toContain("Save a login for acme.example.com");
    expect(v.text()).toContain("Work email");
    expect(v.input("username")?.type).toBe("text");
    expect(v.input("password")?.type).toBe("password");
    await v.unmount();
  });

  it("sends the values to the vault and a value-free receipt to the control plane", async () => {
    const onSettled = jest.fn();
    const v = await render(
      <CredentialCaptureCard
        runId="run-1"
        profileId="prof-1"
        request={request()}
        onSettled={onSettled}
      />,
    );
    await v.type("username", "person@acme.example.com");
    await v.type("password", "hunter2");
    await v.click("Save and continue");

    const [vaultPath, vaultBody] = postJson.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(vaultPath).toBe("/api/vault/browser-login/capture");
    expect(vaultBody.field_values).toEqual({
      username: "person@acme.example.com",
      password: "hunter2",
    });

    const [receiptPath, receiptBody] = postJson.mock.calls[1] as [
      string,
      Record<string, unknown>,
    ];
    expect(receiptPath).toBe("/browser-manager/runs/run-1/capture-result");
    expect(receiptBody).toEqual({
      handoff_id: "ho_1",
      status: "captured",
      credential_item_id: "item-9",
    });
    // 🚨 The receipt is the ONLY thing that leaves after the write — no value
    // rides it, in any field.
    expect(JSON.stringify(receiptBody)).not.toContain("hunter2");
    expect(onSettled).toHaveBeenCalledTimes(1);
    await v.unmount();
  });

  it("refuses to write for a request the agent has already given up on", async () => {
    const v = await render(
      <CredentialCaptureCard
        runId="run-1"
        profileId="prof-1"
        request={request({
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        })}
        onSettled={jest.fn()}
      />,
    );
    expect(v.text()).toContain("This request expired");
    expect(v.button("Save and continue")?.disabled).toBe(true);
    // Dismiss closes the episode; it never writes a credential.
    await v.click("Dismiss");
    expect(postJson).toHaveBeenCalledTimes(1);
    expect(postJson.mock.calls[0][0]).toBe(
      "/browser-manager/runs/run-1/capture-result",
    );
    expect(postJson.mock.calls[0][1]).toMatchObject({ status: "expired" });
    await v.unmount();
  });
});
