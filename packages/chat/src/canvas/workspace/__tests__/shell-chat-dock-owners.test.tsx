/**
 * The shell chat's dock-level owners (reviewer defects on f8382673d7):
 *
 * 1. A page's context entry leaves the conversation when the page does — even
 *    while the chat column is unmounted (phone sheet closed, floating closed).
 *    The column dies with its sheet; the dock does not, so the dock owns it.
 * 2. A remark queued while the chat had no conversation (mid home-switch) is
 *    never staged into ANOTHER home's conversation, and never lost in silence.
 *
 * Real hooks, real CanvasChatColumn, real page-context store and remark sink;
 * only the chat transcript, the composer-mode reads and the store are
 * stand-ins, and the store applies the context actions to a plain map so the
 * assertion is on what the conversation ends up holding.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const contextByConversation = new Map<string, Set<string>>();
const staged: { conversationId: string; text: string }[] = [];
const toastError = jest.fn();

jest.mock("../../../store/hooks", () => ({
  useAppDispatch: () => (action: { type: string; payload?: unknown; staged?: { conversationId: string; text: string } }) => {
    if (action.type.endsWith("/setContextEntries")) {
      const { conversationId, entries } = action.payload as { conversationId: string; entries: { key: string }[] };
      const keys = contextByConversation.get(conversationId) ?? new Set<string>();
      for (const entry of entries) keys.add(entry.key);
      contextByConversation.set(conversationId, keys);
    } else if (action.type.endsWith("/removeContextEntry")) {
      const { conversationId, key } = action.payload as { conversationId: string; key: string };
      contextByConversation.get(conversationId)?.delete(key);
    } else if (action.type === "test/stageRemark" && action.staged) {
      staged.push(action.staged);
    }
    return action;
  },
  useAppSelector: () => undefined,
}));
jest.mock("../../../agents/redux/execution-system/instance-resources/remarks", () => ({
  stageRemark: (conversationId: string, item: { text: string }) => ({
    type: "test/stageRemark",
    staged: { conversationId, text: item.text },
  }),
}));
jest.mock("../../../host/notify", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), info: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));
jest.mock("../../../agents/components/shared/AgentConversationColumn", () => ({
  AgentConversationColumn: () => null,
}));
jest.mock("../../../agents/components/inputs/smart-input/composer/useComposerMode", () => ({
  useComposerMode: () => ({ mode: "chat" }),
}));
jest.mock("../../../agents/components/inputs/smart-input/composer/useCompactInputMaxHeight", () => ({
  useCompactInputMaxHeight: () => ({ measureRef: () => {}, maxInputHeightPx: undefined }),
}));

import { CanvasChatColumn } from "../CanvasChatColumn";
import {
  registerShellChatPageContext,
  resetShellChatPageContextForTest,
  useShellChatPageContext,
} from "../shell-chat-page-context";
import { useShellChatPageEntry, useShellChatRemarkSink } from "../shell-chat-dock-owners";
import {
  activeRemarkSink,
  resetRemarkSinksForTest,
} from "../../../agents/redux/execution-system/instance-resources/remark-sink";
import type { RemarkItem } from "../../../agents/redux/execution-system/instance-resources/remarks";

/** The dock: always mounted; the column only while the sheet is open. */
function Dock({ conversationId, columnMounted }: { conversationId: string | null; columnMounted: boolean }) {
  const page = useShellChatPageContext();
  useShellChatPageEntry(conversationId, page?.getCanvasContext);
  if (!columnMounted) return null;
  return (
    <CanvasChatColumn
      conversation={conversationId ? { state: "ready", conversationId } : { state: "opening", purpose: "new" }}
      surfaceKey="shell-chat"
      getCanvasContext={page?.getCanvasContext}
    />
  );
}

function SinkDock(props: { homeKey: string; conversationId: string | null }) {
  useShellChatRemarkSink({ enabled: true, reveal: () => {}, ...props });
  return null;
}

let root: Root;
beforeEach(() => {
  contextByConversation.clear();
  staged.length = 0;
  toastError.mockClear();
  resetShellChatPageContextForTest();
  resetRemarkSinksForTest();
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
});

const demoPage = () =>
  registerShellChatPageContext({
    getCanvasContext: () => ({ key: "demo_canvas", type: "json", label: "Demo canvas", value: { n: 1 } }),
  });

describe("the page's context entry is owned by the dock", () => {
  it("sheet closed, navigate away, reopen: the old page's entry is gone", () => {
    let release = () => {};
    act(() => {
      release = demoPage();
    });
    act(() => root.render(<Dock conversationId="c1" columnMounted />));
    expect(contextByConversation.get("c1")?.has("demo_canvas")).toBe(true);

    act(() => root.render(<Dock conversationId="c1" columnMounted={false} />)); // sheet closed
    act(() => release()); // navigate away
    act(() => root.render(<Dock conversationId="c1" columnMounted />)); // reopen on /notes

    expect(contextByConversation.get("c1")?.has("demo_canvas")).toBe(false);
  });

  it("a conversation the person leaves for another home does not keep the page", () => {
    act(() => {
      demoPage();
    });
    act(() => root.render(<Dock conversationId="c1" columnMounted={false} />));
    expect(contextByConversation.get("c1")?.has("demo_canvas")).toBe(true);
    act(() => root.render(<Dock conversationId="board-conv" columnMounted={false} />));
    expect(contextByConversation.get("c1")?.has("demo_canvas")).toBe(false);
    expect(contextByConversation.get("board-conv")?.has("demo_canvas")).toBe(true);
  });
});

describe("remarks queued with no conversation stay with their home", () => {
  const remark = (text: string) => ({ kind: "comment", text }) as unknown as RemarkItem;

  it("a comment made on board A never rides on board B's chat — and the person is told", () => {
    act(() => root.render(<SinkDock homeKey="board-A" conversationId={null} />));
    act(() => activeRemarkSink()?.stage(remark("on board A")));
    act(() => root.render(<SinkDock homeKey="board-B" conversationId={null} />));
    act(() => root.render(<SinkDock homeKey="board-B" conversationId="conv-B" />));

    expect(staged).toEqual([]);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("a comment queued for this home is delivered once its conversation exists", () => {
    act(() => root.render(<SinkDock homeKey="board-A" conversationId={null} />));
    act(() => activeRemarkSink()?.stage(remark("on board A")));
    act(() => root.render(<SinkDock homeKey="board-A" conversationId="conv-A" />));

    expect(staged).toEqual([{ conversationId: "conv-A", text: "on board A" }]);
    expect(toastError).not.toHaveBeenCalled();
  });
});
