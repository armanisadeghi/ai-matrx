/**
 * @jest-environment jsdom
 *
 * A checklist IS a task list (owner ruling, 2026-10-06). `{"__kind":"checklist",
 * "items":[{"__kind":"checklist_item",…}]}` is read through the kind registry's alias
 * (`discriminatorAliases`), routes to the tasks block, draws the tickable list, and the ticks
 * are written and read back through `useBlockState`. No component names `checklist`.
 * Use case: a bakery owner ticks "Open business bank account". The door double is the sibling
 * suite's (`block-state-kinds-write-through-the-door`).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockDoor: { rows: Record<string, Record<string, unknown>>; writes: { kind: string; patch: Record<string, unknown> }[] } = {
  rows: {},
  writes: [],
};

jest.mock("@/features/block-state/useBlockState", () => {
  const react = jest.requireActual("react") as typeof React;
  const { splitKindState } = jest.requireActual("@/features/content-ir/react/kind-interaction");
  const { BlockStateContext } = jest.requireActual("@/features/block-state/BlockStateContext");
  return {
    useBlockState: () => {
      const target = react.useContext(BlockStateContext) as { kind: string } | null;
      const kind = target?.kind ?? "unknown";
      const [version, setVersion] = react.useState(0);
      const [view, setView] = react.useState<Record<string, unknown>>({});
      const patch = react.useCallback(
        (next: Record<string, unknown>) => {
          const { durable, view: viewPart } = splitKindState(kind, next);
          if (Object.keys(viewPart).length) setView((held) => ({ ...held, ...viewPart }));
          // Like the real hook: a write that changes nothing is never sent.
          for (const key of Object.keys(durable)) {
            if (JSON.stringify((mockDoor.rows[kind] ?? {})[key]) === JSON.stringify(durable[key])) delete durable[key];
          }
          if (!Object.keys(durable).length) return;
          mockDoor.writes.push({ kind, patch: durable });
          mockDoor.rows[kind] = { ...(mockDoor.rows[kind] ?? {}), ...durable };
          setVersion((v) => v + 1);
        },
        [kind],
      );
      void version;
      const saved = mockDoor.rows[kind];
      const state = saved || Object.keys(view).length ? { ...(saved ?? {}), ...view } : null;
      return { state, loaded: true, patch, saveError: null, hosted: !!target };
    },
  };
});

jest.mock("next/dynamic", () => {
  const react = jest.requireActual("react") as typeof React;
  return (loader: () => Promise<{ default?: React.ComponentType } | React.ComponentType>) => {
    const Lazy = react.lazy(async () => {
      const mod = await loader();
      return { default: (mod as { default?: React.ComponentType }).default ?? (mod as React.ComponentType) };
    });
    return function DynamicBoundary(props: Record<string, unknown>) {
      return react.createElement(react.Suspense, { fallback: null }, react.createElement(Lazy, props));
    };
  };
});
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => undefined,
  useAppStore: () => ({ getState: () => ({}), dispatch: jest.fn(), subscribe: () => () => {} }),
}));
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/hooks/useToastManager", () => ({
  __esModule: true,
  useToastManager: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn(), notify: jest.fn() }),
  default: () => ({}),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/features/canvas/hooks/useCanvas", () => ({
  useCanvas: () => ({ open: jest.fn(), close: jest.fn(), isOpen: false }),
}));
jest.mock("@/features/canvas/hooks/useOpenArtifactInCanvas", () => ({
  useOpenArtifactInCanvas: () => ({ openArtifact: jest.fn() }),
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/features/tasks/components/ImportTasksModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/features/tasks/utils/importConverters", () => ({
  convertTimelineToTasks: () => [],
  convertTroubleshootingToTasks: () => [],
  convertProgressToTasks: () => [],
  convertDecisionTreeToTasks: () => [],
}));
jest.mock("@/features/canvas/components/CanvasArtifactDebugPanel", () => ({ InlineArtifactDebugStrip: () => null }));
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};
if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: jest.requireActual("node:crypto").webcrypto, configurable: true });
}


import { TooltipProvider } from "@/components/ui/tooltip";
import { ArtifactRender } from "../artifact-renderers";
import { applyIrKindRoute } from "@ai-matrx/rich-content/kinds/react/kind-route";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { IR_ENVELOPE_KEY } from "@ai-matrx/content-ir";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { expandKindAliases } from "@/features/content-ir/registry/kind-aliases";
import { TASK_LIST_KIND_DEFINITIONS } from "@/features/content-ir/kinds/task-list";

const CHECKLIST = JSON.stringify(
  {
    __kind: "checklist",
    title: "Bakery opening",
    items: [
      { __kind: "checklist_item", title: "Open business bank account", checked: false },
      { __kind: "checklist_item", text: "Sign the lease", done: false },
    ],
  },
  null,
  2,
);

function routeChecklist() {
  const blocks: RenderBlockPayload[] = [];
  const accumulator = new StreamBlockAccumulator("req-checklist", (payload) => {
    blocks.push((payload as { block: RenderBlockPayload }).block);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  accumulator.ingest(`Here is your plan:\n\n\`\`\`json\n${CHECKLIST}\n\`\`\`\n`, dispatch);
  accumulator.finalize(dispatch);
  const last = [...blocks]
    .reverse()
    .find((b) => b.status === "complete" && (b.metadata?.[IR_ENVELOPE_KEY] as { root?: { kind?: string } } | undefined)?.root?.kind === "checklist");
  if (!last) throw new Error("no complete block streamed");
  return applyIrKindRoute(renderBlockToContentBlock(last));
}

let host: HTMLDivElement;
let root: Root;
async function mount(serverData: unknown) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ArtifactRender canvasType="tasks" mode="artifact" conversationId="bakery-chat" messageId="answer-9" blockIndex={0} serverData={serverData} />
      </TooltipProvider>,
    );
  });
  await act(async () => { jest.advanceTimersByTime(50); });
}
beforeEach(() => { mockDoor.rows = {}; mockDoor.writes = []; jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

describe("a checklist is a task list", () => {
  it("the alias is derived from the task_list definition, not hand-listed", () => {
    expect(kindRegistry.getDefinition("checklist")?.legacyBlockType).toBe("tasks");
    expect(kindRegistry.getDefinition("checklist_item")).toBeDefined();
    const slugs = expandKindAliases(TASK_LIST_KIND_DEFINITIONS).map((d) => d.kind).sort();
    expect(slugs).toEqual(["checklist", "checklist_item", "task_item", "task_list"]);
  });

  it("a streamed checklist answer routes to the tasks block with the checklist text", () => {
    const routed = routeChecklist();
    expect(routed.type).toBe("tasks");
    const content = (routed.serverData as { content?: string }).content ?? "";
    expect(content).toContain("- [ ] Open business bank account");
    expect(content).toContain("- [ ] Sign the lease");
  });

  it("ticks are written through useBlockState and come back after a reload", async () => {
    const serverData = routeChecklist().serverData;
    await mount(serverData);
    expect(host.textContent).toContain("Open business bank account");
    const boxes = () => Array.from(host.querySelectorAll('[role="checkbox"], input[type="checkbox"]'));
    expect(boxes().length).toBeGreaterThanOrEqual(2);
    expect(mockDoor.writes).toHaveLength(0); // opening never writes
    await act(async () => { (boxes()[0] as HTMLElement).click(); });
    await act(async () => { jest.advanceTimersByTime(900); });
    expect(mockDoor.writes).toHaveLength(1);
    expect(mockDoor.writes[0].kind).toBe("tasks");
    expect(Object.values((mockDoor.writes[0].patch.checkboxState ?? {}) as Record<string, boolean>)).toContain(true);

    act(() => root.unmount());
    host.remove();
    await mount(serverData);
    const state = boxes().map((b) => b.getAttribute("aria-checked") ?? String((b as HTMLInputElement).checked));
    expect(state[0]).toBe("true");
    expect(state[1]).toBe("false");
  });
});
