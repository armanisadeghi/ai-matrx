// One agent turn = ONE saved version, at the turn's END (the conversation stops executing) — not after a
// quiet timer; leaving the page flushes; a flush never runs twice. Before: a 4s timer split slow turns
// into several versions and unmount dropped the last edits.
import { act } from "react";
import { createRoot } from "react-dom/client";

let handlers: Record<string, (input: unknown, call?: { conversationId: string }) => unknown> = {};
const world = { executing: false, awaitingTools: false };
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceClientTools: (_name: string, h: typeof handlers) => {
    handlers = h;
  },
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/selectors/aggregate.selectors", () => ({
  selectIsExecuting: () => () => world.executing,
  selectIsAwaitingTools: () => () => world.awaitingTools,
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: (fn: (s: unknown) => unknown) => fn({}) }));

import { useStartAgentTools, type StartAgentHost } from "../../tools/useStartAgentTools";
import { defaultStartDoc } from "../defaultDoc";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(save: StartAgentHost["save"]) {
  let api: ReturnType<typeof useStartAgentTools> | null = null;
  function Probe() {
    api = useStartAgentTools("matrx-user/start-page", { doc: defaultStartDoc(null), personEditing: false, save });
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  return { root, api: () => api!, rerender: () => act(() => root.render(<Probe />)) };
}

const call = { conversationId: "c1" };

it("saves a whole turn once, when the conversation stops executing — however slow the tools are", async () => {
  jest.useFakeTimers();
  const save = jest.fn(async () => ({ ok: true as const }));
  const m = mount(save);
  world.executing = true;
  act(() => void handlers.start_add_widget!({ type: "recent", config: { kind: "note" } }, call));
  m.rerender();
  act(() => jest.advanceTimersByTime(10_000)); // a slow tool between the two changes
  act(() => void handlers.start_remove_widget!({ id: "w_agenda" }, call));
  m.rerender();
  expect(save).not.toHaveBeenCalled();
  world.executing = false;
  await act(async () => m.rerender());
  expect(save).toHaveBeenCalledTimes(1);
  const [, note, opts] = save.mock.calls[0] as unknown as [unknown, string, { byAgent: boolean }];
  expect(note).toMatch(/^Agent: Added Recent notes · Removed Today's meetings/);
  expect(opts).toEqual({ byAgent: true });
  jest.useRealTimers();
});

it("leaving the page flushes the pending turn", async () => {
  const save = jest.fn(async () => ({ ok: true as const }));
  const m = mount(save);
  world.executing = true;
  act(() => void handlers.start_add_widget!({ type: "tasks" }, call));
  await act(async () => m.root.unmount());
  expect(save).toHaveBeenCalledTimes(1);
});

it("an explicit flush (person pressed Edit) saves once even if the turn then ends", async () => {
  const save = jest.fn(async () => ({ ok: true as const }));
  const m = mount(save);
  world.executing = true;
  act(() => void handlers.start_add_widget!({ type: "tasks" }, call));
  m.rerender();
  await act(async () => {
    await Promise.all([m.api().flush(), m.api().flush()]);
  });
  world.executing = false;
  await act(async () => m.rerender());
  expect(save).toHaveBeenCalledTimes(1);
});

it("a conversation paused for its tools between two tool calls is mid-turn: ONE version, not one per tool call", async () => {
  const save = jest.fn(async () => ({ ok: true as const }));
  const m = mount(save);
  world.executing = true;
  act(() => void handlers.start_move_widget!({ id: "w_tasks", position: 0 }, call));
  m.rerender();
  // Between the tool calls the runtime is "paused" (awaiting tool results), no longer running.
  world.executing = false;
  world.awaitingTools = true;
  await act(async () => m.rerender());
  expect(save).not.toHaveBeenCalled();
  world.awaitingTools = false;
  world.executing = true;
  act(() => void handlers.start_move_widget!({ id: "w_agenda", position: 1 }, call));
  m.rerender();
  world.executing = false;
  await act(async () => m.rerender());
  expect(save).toHaveBeenCalledTimes(1);
});
