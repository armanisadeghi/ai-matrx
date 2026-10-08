/**
 * @jest-environment jsdom
 *
 * THE AGENT'S THREAD REPLY, SHOWN IN THE ANSWER AS THE EXCHANGE (threads design
 * 2026-10-03; Arman 2026-10-08: people can't be expected to go find what the
 * agent said). The agent answers a remark with a `comment_reply` fence; while it
 * streams the answer says "Replying to c3…", after it shows ONE quoted-thread
 * card per reply — the person's comment (opening ~300 chars, expandable), any
 * earlier replies as a count, the agent's reply whole — and the card opens the
 * thread in the canvas. A reply the ledger has no record of says so.
 *
 * A handle resolves only inside its own conversation's remarks, and a handle
 * two remarks share resolves to nothing.
 *
 * Use case: a site lead asked "truck scale or floor scale?" (c3) on an answer
 * about weighing aluminum; the intake agent answers in that thread.
 */
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import storeReadsReducer from "@/lib/redux/slices/storeReadsSlice";
import type { CanvasController } from "@ai-matrx/canvas";
import { CanvasProvider, registerCanvasKind, useCanvas } from "@ai-matrx/canvas/react";
import type { DirectiveRendererProps } from "@ai-matrx/content-ir-react";
import {
  remarkByHandle,
  remarksWithHandle,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remark-handles";
import CommentReplyRenderer from "@/features/matrx-envelope/directives/commentReply/CommentReplyRenderer";
import { DirectiveFenceProvider } from "@/features/matrx-envelope/directiveFence";
import DirectiveReceiptBlock, { readThreadLink } from "@/components/mardown-display/blocks/data-events/DirectiveReceiptBlock";
import { COMMENT_THREAD_CANVAS_KIND } from "@/features/rich-document/annotations/canvas/commentThreadKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The ledger re-read a line makes before it calls a reply missing: the ledger has no new row.
jest.mock("@/utils/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["schema", "from", "select", "eq", "not"]) chain[k] = () => chain;
  chain.order = async () => ({ data: [], error: null });
  return { supabase: chain };
});
// The thread's rows, as cmt_list maps them: the site lead's comment, an earlier reply, the agent's.
jest.mock("@/features/rich-document/annotations/service", () => ({
  listCommentThreads: async () => ({
    collaborationDoors: true,
    items: [{
      key: "comment:root-7", kind: "comment", saveState: "confirmed", anchor: null, commentId: "root-7",
      author: { id: "lead", name: "Dana Ortiz", avatarUrl: null }, mine: false, createdAt: "2026-10-05T00:00:00Z",
      body: "Truck scale or floor scale?",
      replies: [
        { id: "reply-1", body: "Checking the yard plan.", createdAt: "2026-10-05T00:01:00Z", mine: false, version: 1, author: { id: "lead", name: "Dana Ortiz" } },
        { id: "reply-9", body: "The truck scale — weigh the whole load before it reaches the baler.", createdAt: "2026-10-05T00:02:00Z", mine: true, version: 1,
          author: { id: "me", name: "Intake Agent", avatarUrl: null, agent: { id: "agent-1", name: "Intake Agent" } } },
      ],
    }],
  }),
}));
jest.mock("@ai-matrx/rich-content/levels/RichContent", () => ({
  RichContent: ({ source }: { source: string }) => <span data-rich>{source}</span>,
}));
// Every kept view of the thread is told to read again (realtime can drop the INSERT, 2026-10-08).
const mockRefreshRecordThreads = jest.fn();
jest.mock("@/features/rich-document/annotations/sidecarStore", () => ({
  refreshRecordThreads: (...args: unknown[]) => mockRefreshRecordThreads(...args),
}));

const SLUG = "directive_v1_action_comment_reply";
const REPLY_TEXT = "The truck scale — weigh the whole load before it reaches the baler.";
const CONVERSATION = "conv-intake";

const userTurn = (items: Record<string, unknown>[]) => ({
  id: `u-${items.length}`,
  conversationId: CONVERSATION,
  role: "user",
  content: [{ type: "input_remarks", items }],
});
const C3 = { kind: "comment", handle: "c3", target: { message_id: "answer-1" }, comment_id: "root-7", quote: "Weigh every inbound load", body: "Truck scale or floor scale?" };
const C4 = { kind: "choice", handle: "c4", target: { message_id: "answer-1" }, body: "SQLite" };

registerCanvasKind(COMMENT_THREAD_CANVAS_KIND);

let canvas: CanvasController | null = null;
function Presented() {
  canvas = useCanvas();
  useEffect(() => canvas!.registerPresentation(), []);
  return null;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** The ledger's reply receipt for one handle, as `fetchConversationReceipts` returns it. */
const replyReceipt = (handle: string) => ({
  ledgerKey: `ledger-${handle}`,
  directive: SLUG,
  message: `Replied in the thread on ${handle}.`,
  createdAt: "2026-10-05T00:00:00Z",
  thread: { entity_type: "message", entity_id: "answer-1", root_id: "root-7", reply_id: "reply-9", handle },
});

function render(
  node: React.ReactNode,
  messages: Record<string, unknown>[] = [userTurn([C3, C4])],
  receipts: unknown[] = [],
) {
  const byId = Object.fromEntries(messages.map((m) => [m.id as string, m]));
  const store = configureStore({
    reducer: {
      // Fixed slices for the transcript and the reader; the real store-reads slice for the reads.
      messages: () => ({ byConversationId: { [CONVERSATION]: { orderedIds: Object.keys(byId), byId } } }),
      // The receipts read is already answered (the zone at the foot reads it once).
      userAuth: () => ({ id: "11111111-1111-1111-1111-111111111111" }), // a signed-in reader: signed-out issues no ledger/message reads
      storeReads: storeReadsReducer,
    } as never,
    preloadedState: {
      storeReads: {
        byKey: { [`chat.directive-receipts:${CONVERSATION}`]: { status: "ready", data: receipts, hasData: true, error: null, at: Date.now() } },
      },
    } as never,
  });
  act(() =>
    root.render(
      <Provider store={store}>
        <CanvasProvider persistence={null} hotkeys={false}>
          <Presented />
          {node}
        </CanvasProvider>
      </Provider>,
    ),
  );
}

const fence = (items: Record<string, unknown>[]) =>
  ({ directive: { slug: SLUG, directiveClass: "action", noun: "comment_reply", items } }) as unknown as DirectiveRendererProps;

function Fence({ streaming, items }: { streaming: boolean; items: Record<string, unknown>[] }) {
  return (
    <DirectiveFenceProvider value={{ streaming, conversationId: CONVERSATION }}>
      <CommentReplyRenderer {...fence(items)} />
    </DirectiveFenceProvider>
  );
}

const items = () => (canvas ? canvas.getState().items : {});

describe("the fence in the answer", () => {
  it("while streaming: 'Replying to c3…', never the reply", () => {
    render(<Fence streaming items={[{ to: "c3", body: REPLY_TEXT }]} />);
    expect(host.textContent).toContain("Replying to c3…");
    expect(host.textContent).not.toContain("truck scale —");
  });

  it("after: the exchange itself — the comment, the earlier history as a count, the agent's reply whole — and it opens the thread on the reply", async () => {
    render(<Fence streaming={false} items={[{ to: "c3", body: REPLY_TEXT }]} />, undefined, [replyReceipt("c3")]);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const card = host.querySelector<HTMLElement>('[data-comment-reply="c3"]')!;
    expect(card.getAttribute("data-comment-reply-state")).toBe("posted");
    expect(card.textContent).toContain("Dana Ortiz");
    expect(card.textContent).toContain("Truck scale or floor scale?");
    expect(card.textContent).toContain("1 earlier reply");
    expect(card.textContent).not.toContain("Checking the yard plan.");
    expect(card.textContent).toContain("Intake Agent");
    expect(card.textContent).toContain(REPLY_TEXT);
    act(() => card.click());
    const tab = items()["comment-thread::message:answer-1" as never] as unknown as { data: { focus: string | null } } | undefined;
    // Focused on the reply that landed, so the panel scrolls to that thread.
    expect(tab?.data.focus).toBe("reply-9");
    expect(mockRefreshRecordThreads).toHaveBeenCalledWith("message", "answer-1");
  });

  it("a long comment shows its opening, the rest behind Show more", async () => {
    const long = `Truck scale or floor scale? ${"We weigh aluminum bales and loose scrap every shift, ".repeat(12)}End of note.`;
    render(<Fence streaming={false} items={[{ to: "c3", body: REPLY_TEXT }]} />, [userTurn([{ ...C3, comment_id: "root-x", body: long }])], [{ ...replyReceipt("c3"), thread: { entity_type: "message", entity_id: "answer-1", root_id: "root-x", reply_id: "reply-x", handle: "c3" } }]);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const card = host.querySelector<HTMLElement>('[data-comment-reply="c3"]')!;
    expect(card.textContent).toContain("Truck scale or floor scale?");
    expect(card.textContent).not.toContain("End of note.");
    // The thread read has no such root: the agent's words come from the fence itself.
    expect(card.textContent).toContain(REPLY_TEXT);
    const more = [...card.querySelectorAll("button")].find((b) => b.textContent === "Show more")!;
    act(() => more.click());
    expect(card.textContent).toContain("End of note.");
    expect(items()["comment-thread::message:answer-1" as never]).toBeUndefined();
  });

  it("a handle that does not resolve here is a plain line, never a dead door", () => {
    render(<Fence streaming={false} items={[{ to: "c99", body: REPLY_TEXT }]} />);
    expect(host.querySelector('[data-comment-reply="c99"]')?.tagName).toBe("SPAN");
    expect(host.textContent).not.toContain("truck scale —");
  });
});

describe("one cue per reply", () => {
  // Live walk 2026-10-05: "Reply in thread · c1" above the paragraph AND
  // "Replied in the thread on c1. Open thread" at the foot — two cues, one reply.
  it("once the ledger's receipt exists the answer's line is still the ONE cue, same words, with a door", () => {
    render(<Fence streaming={false} items={[{ to: "c3", body: REPLY_TEXT }]} />, [], [replyReceipt("c3")]);
    const lines = host.querySelectorAll('[data-comment-reply="c3"]');
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute("role")).toBe("button");
  });

  it("after a reload (remark gone) the ledger's thread link is the line's working door", () => {
    render(<Fence streaming={false} items={[{ to: "c3", body: REPLY_TEXT }]} />, [], [replyReceipt("c3")]);
    const line = host.querySelector<HTMLElement>('[data-comment-reply="c3"][role="button"]')!;
    expect(line).not.toBeNull();
    act(() => line.click());
    const tab = items()["comment-thread::message:answer-1" as never] as unknown as { data: { focus: string | null } } | undefined;
    expect(tab?.data.focus).toBe("reply-9");
  });

  it("another handle's receipt does not hide this reply's line", () => {
    render(<Fence streaming={false} items={[{ to: "c3", body: REPLY_TEXT }]} />, undefined, [replyReceipt("c4")]);
    expect(host.querySelector('[data-comment-reply="c3"]')).not.toBeNull();
  });
});

describe("nothing fails silently", () => {
  // Live 2026-10-08: the line read "Reply in thread · c2" whatever happened to the reply.
  it("a reply to an answer here with no ledger receipt after the turn says it was not posted, with no door", async () => {
    mockRefreshRecordThreads.mockClear();
    render(<Fence streaming={false} items={[{ to: "c3", body: REPLY_TEXT }]} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const line = host.querySelector('[data-comment-reply="c3"]')!;
    expect(line.getAttribute("data-comment-reply-state")).toBe("failed");
    expect(line.textContent).toBe("Couldn't post reply to c3: it was not saved");
    expect(host.querySelector("button")).toBeNull();
  });

  it("the end of the turn re-reads every open view of the thread", () => {
    mockRefreshRecordThreads.mockClear();
    render(<Fence streaming={false} items={[{ to: "c3", body: REPLY_TEXT }]} />, undefined, [replyReceipt("c3")]);
    expect(mockRefreshRecordThreads).toHaveBeenCalledWith("message", "answer-1");
  });
});

describe("the receipt", () => {
  it("is the server's sentence and an Open thread door, focused on the reply that landed", () => {
    // The exact `directive_apply.item` receipt the server sends (ThreadLink, THREADS R3).
    render(
      <DirectiveReceiptBlock
        directive={SLUG}
        outcome="applied"
        message="Replied in the thread on c4."
        resourceKind="comment"
        resourceIds={["reply-9"]}
        thread={{ entity_type: "message", entity_id: "answer-1", root_id: "root-7", reply_id: "reply-9", handle: "c4" }}
      />,
    );
    expect(host.textContent).toBe("Replied in the thread on c4.Open thread");
    act(() => host.querySelector("button")!.click());
    expect(Object.keys(items())).toEqual(["comment-thread::message:answer-1"]);
    const tab = items()["comment-thread::message:answer-1" as never] as unknown as { data: { focus: string | null } };
    expect(tab.data.focus).toBe("reply-9");
  });

  it("a thread link missing its root is no door (the old entity/id spelling is not read)", () => {
    expect(readThreadLink({ entity_type: "message", entity_id: "answer-1" })).toBeNull();
    expect(readThreadLink({ entity: "message", id: "answer-1", comment_id: "root-7" })).toBeNull();
    expect(readThreadLink({ entity_type: "message", entity_id: "a", root_id: "r" })).toEqual({
      entity: "message",
      id: "a",
      rootId: "r",
      replyId: null,
      handle: null,
    });
  });

  it("a failed reply says why, with no door", () => {
    render(<DirectiveReceiptBlock directive={SLUG} outcome="failed" message="Could not reply to c99 — no remark has that handle here" />);
    expect(host.textContent).toBe("Could not reply to c99 — no remark has that handle here");
    expect(host.querySelector("button")).toBeNull();
  });
});

describe("a handle names one remark in its own conversation", () => {
  it("resolves to the remark, its answer and its comment", () => {
    expect(remarkByHandle([userTurn([C3, C4])], "c3")).toMatchObject({ messageId: "answer-1", commentId: "root-7", kind: "comment" });
  });
  it("two remarks sharing a handle resolve to nothing", () => {
    const twice = [userTurn([C3]), { ...userTurn([C3]), id: "u-again" }];
    expect(remarksWithHandle(twice, "c3")).toHaveLength(2);
    expect(remarkByHandle(twice, "c3")).toBeNull();
  });
  it("a malformed handle never matches", () => {
    expect(remarkByHandle([userTurn([{ ...C3, handle: "c03" }])], "c03")).toBeNull();
  });
});
