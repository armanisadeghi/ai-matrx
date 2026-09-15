/**
 * The reply composer's guards.
 *
 * Each test fails if the behaviour is removed, not if the markup is restyled:
 *   * the visible sentence is asserted to be the SERVER's `composer_label` and
 *     nothing else — a different agent name in the mocked report must be the
 *     name on screen, so any client-side sentence, template or fallback fails;
 *   * the announced stand-in is asserted to reach the SCREEN, and only when
 *     the server says the platform default is standing in;
 *   * `can_reply: false` must disable the field AND show the reason;
 *   * before the report lands, and when the read fails, the composer must name
 *     nobody;
 *   * the send test drives the real component (type, click) and asserts the
 *     exact request body, so a changed slug, a dropped `initiation`, or a
 *     client-chosen agent fails;
 *   * the empty-message test asserts ZERO calls reached the API door;
 *   * the failure test asserts the server's own message reaches the screen.
 * Nothing here mocks the component's own code — only the API door and the
 * Redux dispatch it rides on.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/api/call-api", () => ({
  callConversationContinue: jest.fn(),
  callApi: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({
  // The real dispatch executes a thunk; here the door itself is the mock, so
  // dispatch only has to hand back what it produced.
  useAppDispatch: () => (thunk: unknown) => thunk,
}));

import { callApi, callConversationContinue } from "@/lib/api/call-api";
import { AiMatrxReplyComposer } from "./AiMatrxReplyComposer";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The door's real options type — the request shape is asserted against it. */
type DoorOptions = Parameters<typeof callConversationContinue>[0];
/** What the component actually consumes off the result. */
type DoorResult = {
  error?: { type: string; message: string; status?: number };
};

// The real door returns a thunk the real dispatch runs; here dispatch is the
// identity, so the mock resolves the result the component reads. Typed as the
// (options) => Promise<result> pair the component sees, not the thunk type.
const door = callConversationContinue as unknown as jest.Mock<
  Promise<DoorResult>,
  [DoorOptions]
>;

/**
 * `GET /coding-sessions/conversations/{id}/responder` — the read that decides
 * every word this composer shows about who answers. Typed loosely on purpose:
 * the component must render the SERVER's sentence whatever it says.
 */
type ResponderResult = {
  data?: unknown;
  error?: { type: string; message: string; status?: number };
};
const responderDoor = callApi as unknown as jest.Mock<
  Promise<ResponderResult>,
  [{ path: string; method: string; pathParams?: Record<string, string> }]
>;

/** A server report, with only the parts a test cares about spelled out. */
function report(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    conversation_id: "conv-1",
    is_coding_session_mirror: true,
    provider: "claude_code",
    origin: "independent_hook",
    composer_label:
      "Coding Session Responder is answering — Claude Code will not see this reply",
    can_reply: true,
    responder: {
      agent_id: "agent-1",
      agent_name: "Coding Session Responder",
      setting_key: "coding_session.conversation_responder",
      used_platform_default: false,
    },
    ...overrides,
  };
}

async function mount(
  props: Partial<React.ComponentProps<typeof AiMatrxReplyComposer>> = {},
) {
  const onAnswered = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(
      <AiMatrxReplyComposer
        conversationId="conv-1"
        conversationOrganizationId="org-1"
        onAnswered={onAnswered}
        {...props}
      />,
    );
  });

  const textarea = host.querySelector("textarea");
  if (!textarea) throw new Error("the composer rendered no text field");
  const sendButton = Array.from(host.querySelectorAll("button")).find(
    (button) => (button.textContent ?? "").includes("Send to AI Matrx"),
  );
  if (!sendButton) throw new Error("the composer rendered no send button");

  return {
    host,
    onAnswered,
    text: () => host.textContent ?? "",
    sendButton,
    async type(value: string) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      if (!setter) throw new Error("no textarea value setter");
      await act(async () => {
        setter.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    async send() {
      await act(async () => {
        sendButton.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe("AiMatrxReplyComposer", () => {
  beforeEach(() => {
    door.mockReset();
    door.mockResolvedValue({});
    responderDoor.mockReset();
    responderDoor.mockResolvedValue({ data: report() });
  });

  it("shows the SERVER's sentence, naming the agent the server resolved", async () => {
    responderDoor.mockResolvedValue({ data: report() });
    const bound = await mount();
    expect(responderDoor).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/coding-sessions/conversations/{conversation_id}/responder",
        method: "GET",
        pathParams: { conversation_id: "conv-1" },
        // The conversation's OWN organization rides the read. The JWT lane is
        // fail-closed on the organization header, so a session that has not
        // picked one would otherwise be told the label could not be loaded
        // while the server knew the answer (live on aimatrx.com, 2026-09-15).
        scopeOverrides: { organization_id: "org-1" },
      }),
    );
    expect(bound.text()).toContain(
      "Coding Session Responder is answering — Claude Code will not see this reply",
    );
    await bound.unmount();

    // A DIFFERENT agent, and a differently worded server sentence: the screen
    // must say what the server said, so no client-side sentence survives.
    responderDoor.mockResolvedValue({
      data: report({
        composer_label:
          "Session Scribe is answering — Codex will not see this reply.",
        responder: {
          agent_id: "agent-2",
          agent_name: "Session Scribe",
          setting_key: "coding_session.conversation_responder",
          used_platform_default: false,
        },
      }),
    });
    const other = await mount();
    expect(other.text()).toContain(
      "Session Scribe is answering — Codex will not see this reply.",
    );
    expect(other.text()).not.toContain("Coding Session Responder");
    expect(other.text()).not.toContain("AI Matrx is answering");
    await other.unmount();
  });

  it("names nobody before the report lands, and says so when the read fails", async () => {
    let land: ((result: ResponderResult) => void) | null = null;
    responderDoor.mockImplementation(
      () =>
        new Promise<ResponderResult>((resolve) => {
          land = resolve;
        }),
    );
    const pending = await mount();
    expect(pending.text()).not.toContain("is answering —");
    expect(pending.text()).toContain("Checking who answers here…");
    // No guess is offered while the truth is in flight.
    expect(pending.sendButton.hasAttribute("disabled")).toBe(true);
    await act(async () => {
      land?.({ data: report() });
    });
    expect(pending.text()).toContain("Coding Session Responder is answering");
    await pending.unmount();

    responderDoor.mockResolvedValue({
      error: { type: "server_error", message: "Responder lookup failed." },
    });
    const failed = await mount();
    expect(failed.text()).toContain("could not be loaded");
    expect(failed.text()).toContain("Responder lookup failed.");
    // Never an invented answerer behind a failed read.
    expect(failed.text()).not.toContain("is answering —");
    await failed.unmount();
  });

  it("shows the stand-in notice on screen ONLY when the platform default stands in", async () => {
    const standIn =
      "No agent is chosen for coding-conversation replies, so Matrx Chat — the agent a new AI Matrx chat opens with — is answering.";
    responderDoor.mockResolvedValue({
      data: report({
        composer_label:
          "Matrx Chat is answering — the AI Matrx default, because no agent is chosen for coding-conversation replies yet. Claude Code will not see this reply.",
        responder: {
          agent_id: "agent-default",
          agent_name: "Matrx Chat",
          setting_key: "coding_session.conversation_responder",
          used_platform_default: true,
        },
        stand_in_notice: standIn,
      }),
    });
    const stood = await mount();
    expect(stood.text()).toContain("Matrx Chat is answering — the AI Matrx default");
    expect(stood.text()).toContain(standIn);
    await stood.unmount();

    // The same field absent from a normal, bound resolution.
    responderDoor.mockResolvedValue({ data: report() });
    const bound = await mount();
    expect(bound.text()).not.toContain(standIn);
    expect(bound.text()).not.toContain("No agent is chosen");
    await bound.unmount();
  });

  it("refuses to invite a reply it cannot answer, with the server's reason in sight", async () => {
    const refusal =
      "No AI Matrx agent is available to answer here yet, so a reply cannot be answered. An admin binds one by pointing 'coding_session.conversation_responder' at an agent in the Mandate admin.";
    responderDoor.mockResolvedValue({
      data: report({
        composer_label: refusal,
        can_reply: false,
        responder: undefined,
      }),
    });
    const view = await mount();
    const textarea = view.host.querySelector("textarea");
    expect(textarea?.hasAttribute("disabled")).toBe(true);
    expect(view.sendButton.hasAttribute("disabled")).toBe(true);
    // Disabled AND explained — the reason is the server's sentence, in the
    // page, not a tooltip.
    expect(view.text()).toContain(refusal);
    expect(view.text()).toContain("This reply cannot be sent");
    expect(door).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("carries no label at all on a conversation the server says is not a mirror", async () => {
    responderDoor.mockResolvedValue({
      data: {
        schema_version: 1,
        conversation_id: "conv-1",
        is_coding_session_mirror: false,
        composer_label: "",
        can_reply: true,
      },
    });
    const view = await mount();
    expect(view.text()).not.toContain("is answering —");
    expect(view.text()).not.toContain("could not be loaded");
    const textarea = view.host.querySelector("textarea");
    expect(textarea?.hasAttribute("disabled")).toBe(false);
    await view.unmount();
  });

  it("sends the reply on the continuation route with the exact frozen body", async () => {
    const view = await mount();
    await view.type("What did this session change?");
    await view.send();

    expect(door).toHaveBeenCalledTimes(1);
    const options = door.mock.calls[0][0];
    expect(options.conversationId).toBe("conv-1");
    expect(options.body).toEqual({
      user_input: "What did this session change?",
      stream: true,
      source_feature: "coding_session_reply",
      initiation: "user",
    });
    // The server picks the agent. A client-side agent choice would show up
    // here as an extra field.
    expect(Object.keys(options.body as object).sort()).toEqual([
      "initiation",
      "source_feature",
      "stream",
      "user_input",
    ]);
    expect(view.onAnswered).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("never sends an empty or whitespace-only message", async () => {
    const view = await mount();
    expect(view.sendButton.hasAttribute("disabled")).toBe(true);
    await view.send();
    expect(door).not.toHaveBeenCalled();

    await view.type("   \n  ");
    expect(view.sendButton.hasAttribute("disabled")).toBe(true);
    await view.send();
    expect(door).not.toHaveBeenCalled();

    // Disabled is not enough on its own — a control that refuses must SAY
    // why, or it is the dead-looking button this product forbids. (React's
    // own event plugin drops mouse events on an element it rendered as
    // disabled, so the send path cannot be reached from the DOM while the
    // field is empty; the guard inside `submit` is defence in depth behind
    // this state.)
    expect(view.text()).toContain("Write something to send.");
    expect(view.onAnswered).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("shows the streaming answer while it arrives, then hands off to the transcript", async () => {
    let emit: ((text: string) => void) | null = null;
    let finish: (() => void) | null = null;
    door.mockImplementation(
      (options) =>
        new Promise<DoorResult>((resolve) => {
          emit = (text: string) =>
            options.onStreamEvent?.({ event: "chunk", data: { text } });
          finish = () => resolve({});
        }),
    );

    const view = await mount();
    await view.type("Summarize this run");
    await view.send();

    expect(view.text()).toContain("AI Matrx is answering…");
    await act(async () => {
      emit?.("It ran ");
      emit?.("nine tools.");
    });
    expect(view.text()).toContain("It ran nine tools.");
    expect(view.onAnswered).not.toHaveBeenCalled();

    await act(async () => {
      finish?.();
    });
    expect(view.onAnswered).toHaveBeenCalledTimes(1);
    // The durable, attributed rows replace the preview.
    expect(view.text()).not.toContain("It ran nine tools.");
    await view.unmount();
  });

  it("renders the server's own refusal and what to do next, and never claims the reply landed", async () => {
    door.mockResolvedValue({
      error: {
        type: "validation_error",
        message: "A run is already active on this conversation.",
        status: 409,
      },
    });

    const view = await mount();
    await view.type("Another question");
    await view.send();

    expect(view.text()).toContain(
      "A run is already active on this conversation.",
    );
    expect(view.text()).toContain("Wait for it to finish");
    expect(view.onAnswered).not.toHaveBeenCalled();
    // The text is kept so the person does not lose what they wrote.
    const textarea = view.host.querySelector("textarea");
    expect(textarea?.value).toBe("Another question");
    await view.unmount();
  });
});
