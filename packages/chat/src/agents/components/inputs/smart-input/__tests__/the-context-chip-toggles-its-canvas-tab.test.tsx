/**
 * The composer's context chip opens in the canvas (Arman, 2026-10-02).
 *
 * With a canvas on screen, a press on the chip never opens its popover: it
 * toggles the conversation's `conversation-context` tab through the chat
 * host's canvas port, and the chip is pressed (`pressed`) while that tab is in
 * front. A row opens the tab on that value. With no canvas the chip keeps its
 * own popover (its full-view button then refuses aloud through the port).
 *
 * Proven failing before passing: with the chip back on `onOpenFullView` and
 * its own popover state (the pre-canvas wiring), every case here is RED.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { ChatCanvasTab, ChatCanvasTabOpen, ChatCanvasTabRef } from "../../../../../host/contract";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ChipProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenFullView: () => void;
  onOpenRow?: (key: string) => void;
  className?: string;
  pressed?: boolean;
  label?: string;
};
const chip: { props: ChipProps | null } = { props: null };
const canvas: { tab: ChatCanvasTab; ref: ChatCanvasTabRef | null; presses: ChatCanvasTabOpen[] } = {
  tab: { isAvailable: true, isVisible: false, selected: null, toggle: () => undefined },
  ref: null,
  presses: [],
};

jest.mock("@ai-matrx/agents/context/react", () => ({
  ContextRulesChip: (props: ChipProps) => {
    chip.props = props;
    return null;
  },
}));
jest.mock("../../../../../host/canvas", () => ({
  useChatCanvasTab: (ref: ChatCanvasTabRef) => {
    canvas.ref = ref;
    return { ...canvas.tab, toggle: (open: ChatCanvasTabOpen) => canvas.presses.push(open) };
  },
}));
const STATE = {
  conversations: { byConversationId: { c1: { mandateKey: null, surfaceName: "notes", agentId: "a1" } } },
  instanceContext: { receiptByConversationId: {} },
  agentDefinition: { agents: {} },
};
jest.mock("../../../../../store/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (select: (state: unknown) => unknown) => select(STATE),
}));
jest.mock("../../../../../surfaces/utils/surface-display", () => ({
  getSurfaceDisplayLabel: (name: string) => ({ notes: "Notes" })[name] ?? name,
}));
jest.mock("../../../../../surfaces/redux/userStateSlice", () => ({ ensureSurfaceFeatureLoaded: () => ({ type: "x" }) }));
jest.mock("../../../../../surfaces/runtime/SurfaceRuntimeContext", () => ({ useIsPageOwnConversation: () => false }));
jest.mock("../../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors", () => ({
  selectPageContextOff: () => () => null,
}));
jest.mock("../../../../redux/execution-system/thunks/page-context.thunk", () => ({ setPageContextEnabled: () => ({ type: "x" }) }));
jest.mock("../../../../redux/execution-system/context-rules/request-context", () => ({
  agentContextLayerKnown: () => true,
  selectContextInlineCap: () => 4000,
}));
jest.mock("../../../../redux/execution-system/context-rules/context-rules.thunks", () => ({
  ensureAgentContextLayer: () => ({ type: "x" }),
  reloadContextRules: () => ({ type: "x" }),
  saveContextRule: () => ({ type: "x" }),
  saveContextRules: () => ({ type: "x" }),
}));
jest.mock("../../../../redux/execution-system/context-rules/context-hierarchy", () => ({
  contextRowPlacer: () => () => null,
  surfaceLevelPlace: () => null,
}));
jest.mock("../../../../redux/execution-system/utils/build-tool-injection", () => ({ resolveClientSurface: () => null }));
jest.mock("../../../../redux/execution-system/context-rules/mandate-kill-switch", () => ({
  resolveMandateKillSwitch: () => Promise.resolve(false),
}));
jest.mock("../../../shared/transcript-audience", () => ({ useMachineFramesVisible: () => true }));
jest.mock("../useConversationDisplayRows", () => ({
  useConversationDisplayRows: () => [{ key: "lane", surfaceKey: "notes", label: "Lane" }],
}));
jest.mock("@ai-matrx/kit/media-query", () => ({ useIsMobile: () => false }));

import { ConversationContextChip } from "../ConversationContextChip";
import { CONVERSATION_CONTEXT_KIND } from "../../../../../host/canvas-tabs";

function render() {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<ConversationContextChip conversationId="c1" agentId="a1" />));
  return () => act(() => root.unmount());
}

beforeEach(() => {
  chip.props = null;
  canvas.ref = null;
  canvas.presses = [];
  canvas.tab = { isAvailable: true, isVisible: false, selected: null, toggle: () => undefined };
});

it("a press opens the small preview first; its full view opens the canvas tab (Arman, 2026-10-04)", () => {
  const unmount = render();
  expect(canvas.ref).toEqual({ kind: CONVERSATION_CONTEXT_KIND, key: "c1" });
  // The chip owns its popover again: nothing forces it shut or hijacks the press.
  expect(chip.props?.open).toBeUndefined();
  expect(chip.props?.onOpenChange).toBeUndefined();
  act(() => chip.props?.onOpenFullView());
  expect(canvas.presses).toEqual([
    { title: "Notes", data: { conversationId: "c1", agentId: "a1", title: "Notes" } },
  ]);
  unmount();
});

it("a row opens the tab on that value", () => {
  const unmount = render();
  act(() => chip.props?.onOpenRow?.("lane"));
  expect(canvas.presses[0]?.selected).toBe("lane");
  unmount();
});

it("is pressed (a real toggle, not a colour) only while the tab is in front", () => {
  let unmount = render();
  expect(chip.props?.pressed).toBe(false);
  expect(chip.props?.className).toBeUndefined();
  unmount();
  canvas.tab = { ...canvas.tab, isVisible: true };
  unmount = render();
  expect(chip.props?.pressed).toBe(true);
  unmount();
});

it("with no canvas on screen the chip keeps its own popover", () => {
  canvas.tab = { ...canvas.tab, isAvailable: false };
  const unmount = render();
  expect(chip.props?.open).toBeUndefined();
  expect(chip.props?.onOpenChange).toBeUndefined();
  // Its full-view button still goes through the port, which refuses aloud.
  act(() => chip.props?.onOpenFullView());
  expect(canvas.presses).toHaveLength(1);
  unmount();
});
