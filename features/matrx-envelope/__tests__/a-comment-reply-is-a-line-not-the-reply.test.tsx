/**
 * @jest-environment jsdom
 *
 * THE AGENT'S REPLY LIVES IN THE THREAD, NEVER IN THE ANSWER (threads design,
 * 2026-10-03). The agent answers a remark with a `comment_reply` fence; the
 * answer shows ONE line per reply naming the remark's handle — "Replying to
 * c3…" while it streams, then a door that opens the thread in the canvas —
 * and the receipt is the server's sentence plus "Open thread". The reply's
 * words never render in the answer body.
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
import type { CanvasController } from "@ai-matrx/canvas";
import { CanvasProvider, registerCanvasKind, useCanvas } from "@ai-matrx/canvas/react";
import type { DirectiveRendererProps } from "@ai-matrx/content-ir-react";
import {
  remarkByHandle,
  remarksWithHandle,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remark-handles";
import CommentReplyRenderer from "@/features/matrx-envelope/directives/commentReply/CommentReplyRenderer";
import { DirectiveFenceProvider } from "@/features/matrx-envelope/directiveFence";
import DirectiveReceiptBlock from "@/components/mardown-display/blocks/data-events/DirectiveReceiptBlock";
import { COMMENT_THREAD_CANVAS_KIND } from "@/features/rich-document/annotations/canvas/commentThreadKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function render(node: React.ReactNode, messages: Record<string, unknown>[] = [userTurn([C3, C4])]) {
  const byId = Object.fromEntries(messages.map((m) => [m.id as string, m]));
  const store = configureStore({
    reducer: {
      messages: () => ({ byConversationId: { [CONVERSATION]: { orderedIds: Object.keys(byId), byId } } }),
    },
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

  it("after: one line per reply that opens its thread in the canvas, focused on the root", () => {
    render(<Fence streaming={false} items={[{ to: "c3", body: REPLY_TEXT }, { to: "c4", body: "SQLite keeps the log on the yard laptop." }]} />);
    expect(host.textContent).not.toContain("truck scale —");
    expect(host.textContent).not.toContain("yard laptop");
    const line = host.querySelector<HTMLButtonElement>('button[data-comment-reply="c3"]')!;
    expect(line.textContent).toBe("Reply in thread · c3");
    act(() => line.click());
    const tab = items()["comment-thread::message:answer-1" as never] as { data: { focus: string | null } } | undefined;
    expect(tab?.data.focus).toBe("root-7");
    // c4 (a choice) has no comment yet: its thread opens on the answer, unfocused.
    expect(host.querySelector('button[data-comment-reply="c4"]')).not.toBeNull();
  });

  it("a handle that does not resolve here is a plain line, never a dead door", () => {
    render(<Fence streaming={false} items={[{ to: "c99", body: REPLY_TEXT }]} />);
    expect(host.querySelector('[data-comment-reply="c99"]')?.tagName).toBe("SPAN");
    expect(host.textContent).not.toContain("truck scale —");
  });
});

describe("the receipt", () => {
  it("is the server's sentence and an Open thread door", () => {
    render(
      <DirectiveReceiptBlock
        directive={SLUG}
        outcome="applied"
        message="Replied in thread"
        thread={{ entity_type: "message", entity_id: "answer-1", root_id: "root-7" }}
      />,
    );
    expect(host.textContent).toBe("Replied in threadOpen thread");
    act(() => host.querySelector("button")!.click());
    expect(Object.keys(items())).toEqual(["comment-thread::message:answer-1"]);
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
