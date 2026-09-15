/**
 * The reply composer's guards.
 *
 * Each test fails if the behaviour is removed, not if the markup is restyled:
 *   * the boundary sentence is asserted VERBATIM against the rendered text, so
 *     softening it, hiding it behind hover, or dropping the provider
 *     substitution fails;
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
}));
jest.mock("@/lib/redux/hooks", () => ({
  // The real dispatch executes a thunk; here the door itself is the mock, so
  // dispatch only has to hand back what it produced.
  useAppDispatch: () => (thunk: unknown) => thunk,
}));

import { callConversationContinue } from "@/lib/api/call-api";
import {
  AiMatrxReplyComposer,
  replyBoundarySentence,
} from "./AiMatrxReplyComposer";

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
        providerLabel="Claude Code"
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
  });

  it("always shows the exact boundary sentence, naming the provider it is shown on", async () => {
    const claude = await mount();
    expect(claude.text()).toContain(
      "AI Matrx is answering — Claude Code will not see this reply",
    );
    await claude.unmount();

    const codex = await mount({ providerLabel: "Codex" });
    expect(codex.text()).toContain(
      "AI Matrx is answering — Codex will not see this reply",
    );
    // Only the provider name is substituted — nothing else in the sentence.
    expect(codex.text()).not.toContain("Claude Code");
    await codex.unmount();

    expect(replyBoundarySentence("Cursor")).toBe(
      "AI Matrx is answering — Cursor will not see this reply",
    );
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
