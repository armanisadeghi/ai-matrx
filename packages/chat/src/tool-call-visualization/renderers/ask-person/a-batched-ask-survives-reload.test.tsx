import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ToolLifecycleEntry } from "../../../agents/types/request.types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver; the card's scroll-fade only needs it to exist.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

registerChatUi({ ErrorAlchemyMenu: () => null });

const fetchPending = jest.fn();
const completeAsSelf = jest.fn();
jest.mock("@host/features/action-requests/self-service", () => ({
  fetchPendingActionRequests: (...args: unknown[]) => fetchPending(...args),
  completeActionRequestAsSelf: (...args: unknown[]) => completeAsSelf(...args),
}));

const dispatchSpy = jest.fn((action: unknown) => ({
  unwrap: () => Promise.resolve(action),
}));
jest.mock("../../../store/hooks", () => ({
  useAppDispatch: () => dispatchSpy,
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../store/hooks"));
const loadConversation = jest.fn((args: unknown) => ({ type: "loadConversation", args }));
jest.mock("../../../agents/redux/execution-system/thunks/load-conversation.thunk", () => ({
  loadConversation: (args: unknown) => loadConversation(args),
}));

import { AskPersonInline } from "./AskPersonInline";
import { getInlineRenderer } from "../../registry/registry";

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


/**
 * Guards for the 2026-10-04 ruling: `ask_person` is the ONE way to ask the
 * person, and it loses nothing the retired `user` tool did.
 *   1. An ask survives a reload — the card is rebuilt from the SERVER's stored
 *      request, never from this tab's memory.
 *   2. A batched ask returns each answer, by position, skips included.
 *   3. An old conversation holding a `user` call still renders its Q&A.
 */
const QUESTIONS_RENDER = {
  form: "questions",
  title: "3 questions",
  subtitle: null,
  submit_label: "Send",
  footnote: "Skip anything you like.",
  questions: [
    { type: "confirm", question: "Email invoice 1182 to Cascade Plumbing now?" },
    {
      type: "choice",
      question: "Which crew takes the Ridgeline job?",
      options: [{ label: "North crew" }, { label: "South crew" }],
      allow_other: true,
    },
    { type: "text", question: "Anything the crew should know about the site?" },
  ],
};

function choose(container: HTMLElement, label: string) {
  const input = [...container.querySelectorAll("input")].find(
    (i) => (i as HTMLInputElement).value === label,
  ) as HTMLInputElement | undefined;
  if (!input) throw new Error(`no option "${label}"`);
  input.click();
}

function visibleButton(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label && !b.closest(".hidden"),
  );
  if (!found) throw new Error(`no visible button "${label}"`);
  return found as HTMLButtonElement;
}

describe("ask_person questions — the one way to ask", () => {
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

  it("rebuilds the ask from the server after a reload and returns each answer by position", async () => {
    fetchPending.mockResolvedValue([pendingRow("questions", QUESTIONS_RENDER)]);
    completeAsSelf.mockResolvedValue({
      status: 200,
      body: { state: "done", message: "Got it, I'm on it.", next: null },
    });

    // First mount, then a RELOAD: the tab's memory is gone (fresh root), and
    // the only thing that can redraw the ask is the server's stored row.
    await act(async () => {
      root.render(<AskPersonInline entry={parkedEntry("questions")} conversationId="conv-1" />);
    });
    await flush();
    expect(container.textContent).toContain("Email invoice 1182 to Cascade Plumbing now?");
    act(() => root.unmount());
    root = createRoot(container);
    fetchPending.mockClear();
    await act(async () => {
      root.render(<AskPersonInline entry={parkedEntry("questions")} conversationId="conv-1" />);
    });
    await flush();
    expect(fetchPending).toHaveBeenCalled();
    expect(container.textContent).toContain("Email invoice 1182 to Cascade Plumbing now?");
    expect(container.textContent).toContain("1 of 3");

    await act(async () => visibleButton(container, "Yes").click());
    expect(container.textContent).toContain("2 of 3");
    await act(async () => choose(container, "South crew"));
    await act(async () => visibleButton(container, "Next").click());
    expect(container.textContent).toContain("3 of 3");
    await act(async () => visibleButton(container, "Skip & send").click());
    await flush();

    expect(completeAsSelf).toHaveBeenCalledTimes(1);
    const [requestId, orgId, answer] = completeAsSelf.mock.calls[0];
    expect(requestId).toBe(REQUEST_ID);
    expect(orgId).toBe(ORG_ID);
    const result = (answer as { result: { answers: Record<string, unknown>[]; cancelled: boolean } })
      .result;
    expect(result.answers).toHaveLength(3);
    expect(result.answers[0].confirmed).toBe(true);
    expect(result.answers[1].selected).toEqual(["South crew"]);
    expect(result.answers[2].cancelled).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(container.textContent).toContain("Got it, I'm on it.");
  });

  it("still renders an old conversation's `user` call — single and batched", async () => {
    const UserInline = getInlineRenderer("user");
    expect(UserInline).toBeTruthy();
    const Inline = UserInline as React.ComponentType<{ entry: ToolLifecycleEntry; expanded?: boolean }>;
    const base = parkedEntry("x");
    const batched: ToolLifecycleEntry = {
      ...base,
      toolName: "user",
      status: "completed",
      arguments: {
        questions: [
          { type: "confirm", question: "Send the Cascade Plumbing invoice?" },
          { type: "choice_many", question: "Which reminders?", options: ["Text", "Email"] },
          { type: "text", question: "Gate code?" },
        ],
      },
      result: {
        answers: [
          { confirmed: true, cancelled: false },
          { selected: ["Text", "Email"], cancelled: false },
          { cancelled: true },
        ],
        cancelled: false,
        timed_out: false,
      },
    };
    await act(async () => {
      root.render(<Inline entry={batched} expanded />);
    });
    const text = container.textContent ?? "";
    expect(text).toContain("Send the Cascade Plumbing invoice?");
    expect(text).toContain("Yes");
    expect(text).toContain("Text · Email");
    expect(text).toContain("(skipped)");

    const single: ToolLifecycleEntry = {
      ...base,
      toolName: "user",
      status: "completed",
      arguments: { type: "text", question: "What is the site address?" },
      result: { answer: "41 Ridgeline Rd", cancelled: false, timed_out: false },
    };
    await act(async () => {
      root.render(<Inline entry={single} expanded />);
    });
    expect(container.textContent).toContain("What is the site address?");
    expect(container.textContent).toContain("41 Ridgeline Rd");
  });
});
