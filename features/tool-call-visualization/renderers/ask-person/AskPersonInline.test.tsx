import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));

const fetchPending = jest.fn();
const completeAsSelf = jest.fn();
jest.mock("@/features/action-requests/self-service", () => ({
  fetchPendingActionRequests: (...args: unknown[]) => fetchPending(...args),
  completeActionRequestAsSelf: (...args: unknown[]) => completeAsSelf(...args),
}));

import { AskPersonInline } from "./AskPersonInline";

const REQUEST_ID = "3b1c6a52-8f7e-4c1d-9a2b-5d6e7f809123";
const ORG_ID = "9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4";

function parkedEntry(kind: string): ToolLifecycleEntry {
  return {
    callId: "ask-person-call",
    toolName: "ask_person",
    displayName: "ask_person",
    status: "started",
    arguments: { kind, payload: {} },
    result: {
      __kind: "action_request.parked",
      action_request_id: REQUEST_ID,
      kind,
      expires_at: "2026-09-26T14:00:00+00:00",
      notifications: 1,
    },
    resultPreview: null,
    startedAt: "2026-09-26T13:00:00.000Z",
    completedAt: null,
    latestMessage: null,
    latestData: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  };
}

function pendingRow(kind: string, render: Record<string, unknown>) {
  return {
    request_id: REQUEST_ID,
    kind,
    render: { __kind: "action_request.render", ...render },
    organization_id: ORG_ID,
    conversation_id: "conv-1",
    link_expires_at: null,
    link_live: false,
    answer_by: null,
    created_at: "2026-09-26T13:00:00+00:00",
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("no value setter");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found as HTMLButtonElement;
}

describe("AskPersonInline — the in-chat ask", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchPending.mockReset();
    completeAsSelf.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("draws the credential form from the pending row and answers as the signed-in person", async () => {
    fetchPending.mockResolvedValue([
      pendingRow("credential_capture", {
        form: "credential",
        title: "Save your example.com sign-in",
        subtitle: "Your agent will save this login to your vault.",
        origin: "https://example.com",
        site_name: "example.com",
        fields: [
          { key: "username", label: "Username", secret: false },
          { key: "password", label: "Password", secret: true },
        ],
        allow_authenticator_secret: true,
        submit_label: "Save sign-in",
      }),
    ]);
    completeAsSelf.mockResolvedValue({
      status: 200,
      body: { state: "done", message: "Got it, I'm on it.", next: "Saved to your vault." },
    });

    await act(async () => {
      root.render(<AskPersonInline entry={parkedEntry("credential_capture")} conversationId="conv-1" />);
    });
    await flush();

    const text = container.textContent ?? "";
    expect(text).toContain("Save your example.com sign-in");
    expect(text).toContain("Your agent will save this login to your vault.");
    expect(text).toContain("https://example.com");
    expect(text).toContain("Authenticator setup key");

    const password = container.querySelector('input[type="password"]') as HTMLInputElement;
    expect(password).not.toBeNull();
    const username = container.querySelector('input[autocomplete="username"]') as HTMLInputElement;

    await act(async () => {
      setInput(username, "test@example.com");
      setInput(password, "hunter2-example");
    });
    await act(async () => {
      button(container, "Save sign-in").click();
    });
    await flush();

    expect(completeAsSelf).toHaveBeenCalledWith(REQUEST_ID, ORG_ID, {
      field_values: { username: "test@example.com", password: "hunter2-example" },
      origin: "https://example.com",
    });
    expect(container.textContent).toContain("Got it, I'm on it.");
    expect(container.textContent).toContain("Saved to your vault.");
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("draws vault_item with no origin line and sends only field_values", async () => {
    fetchPending.mockResolvedValue([
      pendingRow("vault_capture", {
        form: "vault_item",
        title: "Save your Stripe API key",
        subtitle: "Only you and your agents can use it.",
        fields: [
          { key: "label", label: "Name", secret: false },
          { key: "api_key", label: "API key", secret: true },
        ],
        submit_label: "Save to vault",
      }),
    ]);
    completeAsSelf.mockResolvedValue({ status: 200, body: { state: "done", message: "Saved." } });

    await act(async () => {
      root.render(<AskPersonInline entry={parkedEntry("vault_capture")} conversationId="conv-1" />);
    });
    await flush();

    expect(container.textContent).toContain("Save your Stripe API key");
    expect(container.querySelector("textarea")).toBeNull();
    const inputs = [...container.querySelectorAll("input")] as HTMLInputElement[];
    expect(inputs.map((i) => i.type)).toEqual(["text", "password"]);

    await act(async () => {
      setInput(inputs[0], "Stripe live");
      setInput(inputs[1], "sk_test_example");
    });
    await act(async () => {
      button(container, "Save to vault").click();
    });
    await flush();

    expect(completeAsSelf).toHaveBeenCalledWith(REQUEST_ID, ORG_ID, {
      field_values: { label: "Stripe live", api_key: "sk_test_example" },
    });
    expect(container.textContent).toContain("Saved.");
  });

  it("an expired code is a retry: the server's sentence, and an empty box again", async () => {
    fetchPending.mockResolvedValue([
      pendingRow("one_time_code", {
        form: "one_time_code",
        title: "Enter the code example.com sent you",
        origin: "https://example.com",
        submit_label: "Send code",
        challenge_kind: "unknown",
        period_seconds: 30,
      }),
    ]);
    completeAsSelf.mockResolvedValue({
      status: 200,
      body: { state: "retry", message: "That code expired on the way in.", next: "Send the next one." },
    });

    await act(async () => {
      root.render(<AskPersonInline entry={parkedEntry("one_time_code")} conversationId="conv-1" />);
    });
    await flush();

    const box = container.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement;
    await act(async () => setInput(box, "483 920"));
    await act(async () => {
      button(container, "Send code").click();
    });
    await flush();

    expect(completeAsSelf).toHaveBeenCalledWith(REQUEST_ID, ORG_ID, {
      field_values: { code: "483920" },
      origin: "https://example.com",
    });
    expect(container.textContent).toContain("That code expired on the way in.");
    const again = container.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement;
    expect(again.value).toBe("");
  });

  it("an ask that is no longer pending is a quiet line, never a dead form", async () => {
    fetchPending.mockResolvedValue([]);

    await act(async () => {
      root.render(
        <AskPersonInline entry={parkedEntry("credential_capture")} conversationId="conv-1" isPersisted />,
      );
    });
    await flush();

    expect(container.textContent).toContain("This ask is no longer open.");
    expect(container.querySelector("input")).toBeNull();
  });
});
