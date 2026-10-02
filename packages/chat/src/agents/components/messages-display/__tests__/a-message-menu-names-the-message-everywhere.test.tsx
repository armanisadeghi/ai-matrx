/**
 * THE SAME MESSAGE GETS THE SAME MENU HEADING EVERYWHERE — a forcing function.
 *
 * Reported 2026-09-28 on /agent-apps/<id>/run → Run History: a chat message's
 * right-click menu was headed "Content: <the whole text>" while the same kind
 * of message elsewhere read "AI answer · <time>". The per-answer registry menu
 * named its message (its content source is `chat-message`); the transcript's
 * own menu — which every turn without a per-message menu falls through to,
 * the person's own turns included — named nothing, because the user bubble
 * carried no `data-message-id` and the header only looked at the source.
 *
 * The chain under test is the real one:
 *   the REAL `AgentUserMessage` renders → the REAL `resolveMarkdownContext`
 *   reads the right-clicked element → the REAL `chatMessageSubject` +
 *   `menuHeader` build the heading.
 * And it must equal the heading the per-message door builds for that message.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AgentUserMessage } from "../user/AgentUserMessage";
import { TranscriptAudienceProvider } from "@/features/agents/components/shared/transcript-audience";
import { resolveMarkdownContext } from "@/features/context-menu-v3/utils/resolveMarkdownContext";
import { chatMessageSubject, menuHeader } from "@/features/context-menu-v3/alchemy-provider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION = "conv-run-history";
const USER_MESSAGE = "msg-user-1";
const ANSWER = "msg-answer-1";
const CLAIM = "Claim: Goldfish have a three-second memory.";
const SENT_AT = "2026-09-27T18:50:00Z";

let mockState: Record<string, unknown> = {};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: () => mockState }),
}));
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <p>{content}</p>,
}));
jest.mock("../user/UserActionBar", () => ({ UserActionBar: () => null }));
jest.mock("../MessageAttachmentStrip", () => ({ MessageAttachmentStrip: () => null }));
jest.mock("@/features/agents/components/context-policies-display/ContextPolicyChipStrip", () => ({
  ContextPolicyChipStrip: () => null,
}));
jest.mock("@/features/scopes/hooks/useEntityTitles", () => ({
  useEntityTitles: () => ({ titleFor: () => undefined }),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({ EntityRef: () => null }));

function buildState(): Record<string, unknown> {
  return {
    instanceVariableValues: { byConversationId: {} },
    conversations: { byConversationId: {} },
    messages: {
      byConversationId: {
        [CONVERSATION]: {
          orderedIds: [USER_MESSAGE, ANSWER],
          hasMoreOlder: false,
          byId: {
            [USER_MESSAGE]: {
              id: USER_MESSAGE,
              role: "user",
              position: 0,
              createdAt: SENT_AT,
              content: [{ type: "text", text: CLAIM }],
              userContent: [{ type: "text", text: CLAIM }],
              metadata: {},
            },
            [ANSWER]: {
              id: ANSWER,
              role: "assistant",
              position: 1,
              createdAt: SENT_AT,
              content: [{ type: "text", text: "Goldfish remember for months." }],
              metadata: {},
            },
          },
        },
      },
    },
    userAuth: { adminLevel: null },
  };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockState = buildState();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <TranscriptAudienceProvider audience="builder">
        <AgentUserMessage conversationId={CONVERSATION} messageId={USER_MESSAGE} />
      </TranscriptAudienceProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** What the transcript-level menu heads itself with, right-clicking `target`. */
function transcriptMenuHeading(target: HTMLElement) {
  const contextData = resolveMarkdownContext(target, CONVERSATION);
  const subject = chatMessageSubject({
    state: mockState,
    source: { type: "none" },
    contextData,
  });
  return menuHeader({ source: contextData.content ? "content" : "none", text: contextData.content ?? "" }, null, subject);
}

/** What the per-message registry menu heads itself with for that message. */
function perMessageMenuHeading(messageId: string, text: string) {
  const subject = chatMessageSubject({
    state: mockState,
    source: { type: "chat-message", conversationId: CONVERSATION, messageId },
  });
  return menuHeader({ source: "content", text }, null, subject);
}

describe("a chat message's menu heading", () => {
  it("names the person's own turn from the transcript menu — never 'Content: <text>'", () => {
    const text = [...host.querySelectorAll("p")].find((p) => p.textContent === CLAIM);
    expect(text).toBeDefined();
    const heading = transcriptMenuHeading(text!);
    expect(heading.contentLabel).toMatch(/^Your message · Sep 27, /);
    expect(heading.content).toBe("");
  });

  it("is the same heading the per-message door gives that message", () => {
    const text = [...host.querySelectorAll("p")].find((p) => p.textContent === CLAIM)!;
    expect(transcriptMenuHeading(text)).toEqual(perMessageMenuHeading(USER_MESSAGE, CLAIM));
  });

  it("names an answer the same way through either door", () => {
    const answer = document.createElement("div");
    answer.setAttribute("data-message-id", ANSWER);
    answer.innerHTML = `<div data-message-content><p>Goldfish remember for months.</p></div>`;
    document.body.appendChild(answer);
    try {
      const heading = transcriptMenuHeading(answer.querySelector("p")!);
      expect(heading.contentLabel).toMatch(/^AI answer · Sep 27, /);
      expect(heading).toEqual(perMessageMenuHeading(ANSWER, "Goldfish remember for months."));
    } finally {
      answer.remove();
    }
  });

  it("a selection still shows itself", () => {
    const text = [...host.querySelectorAll("p")].find((p) => p.textContent === CLAIM)!;
    const subject = chatMessageSubject({
      state: mockState,
      source: { type: "none" },
      contextData: resolveMarkdownContext(text, CONVERSATION),
    });
    expect(menuHeader({ source: "selection", text: "three-second" }, null, subject).contentLabel).toBeNull();
  });
});
