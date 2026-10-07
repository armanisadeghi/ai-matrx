/**
 * @jest-environment jsdom
 *
 * EVERY MIGRATED KIND WRITES WHAT A PERSON DOES THROUGH THE ONE DOOR.
 *
 * `useBlockState` is the one primitive (platform.block_states). Each kind below
 * is rendered through the real `ArtifactRender` (the chat / canvas / card entry),
 * a person acts on it, and the test proves:
 *   1. the action reaches the door as a durable patch with the kind's answer key;
 *   2. unmount + a fresh mount (a reload) shows it back, from the door only;
 *   3. a pure view action (a slide, a sort) never writes — it stays local.
 *
 * The door double is an in-memory table keyed by kind; the real
 * `splitKindState` still decides what is durable and what is view.
 *
 * Use case: Dana ticks recipe steps and answers a quiz on her laptop; her phone
 * shows the same state after a reload.
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
import { createSampleComparisonTable } from "@/components/mardown-display/blocks/comparison/parseComparisonJSON";

const SHAPES: Record<string, { raw?: string; data?: unknown }> = {
  "decision-tree": {
    raw: JSON.stringify({
      decision_tree: {
        title: "Which yard takes the load",
        root: { question: "Is the scrap mostly steel?", yes: { action: "Take it to North yard" }, no: { action: "Take it to South yard" } },
      },
    }),
  },
  troubleshooting: {
    raw: [
      "### Scale shows no weight",
      "",
      "**Symptom:** The yard scale reads zero with a truck on it.",
      "",
      "**Possible Causes:**",
      "1. Loose cable",
      "",
      "**Solutions:**",
      "1. **Reseat the cable**: Check the scale connection",
      "   - Unplug the scale cable",
      "   - Plug it back in firmly",
    ].join("\n"),
  },
  progress: {
    raw: ["### Yard opening checklist", "", "**Morning**", "- [ ] Calibrate the scale", "- [ ] Unlock the gate"].join("\n"),
  },
  recipe: {
    raw: [
      "<cooking_recipe>",
      "### Weeknight chili",
      "**Yields:** 6 servings",
      "**Total Time:** 45 minutes",
      "",
      "#### Ingredients",
      "- 1 lb ground beef",
      "- 2 cans kidney beans",
      "",
      "#### Instructions",
      "1. Brown the beef",
      "2. Add the beans and simmer",
      "</cooking_recipe>",
    ].join("\n"),
  },
  comparison: { data: createSampleComparisonTable() },
  presentation: {
    data: {
      slides: [
        { type: "title", title: "Yard safety briefing", subtitle: "Monday" },
        { type: "content", title: "Gloves on", bullets: ["Wear gloves", "Check boots"] },
      ],
    },
  },
  quiz: { data: JSON.parse(require("node:fs").readFileSync(require("node:path").join(process.cwd(), "components/mardown-display/blocks/quiz/example-quiz.json"), "utf8")) },
  questionnaire: {
    raw: [
      "## Q1: How many sales do you ring up on a busy day?",
      "Type: Input",
      "",
      "## Q2: Which plan fits?",
      "Type: Radio",
      "- Starter",
      "- Growth",
    ].join("\n"),
  },
};

let host: HTMLDivElement;
let root: Root;

async function mount(canvasType: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <TooltipProvider>
        <ArtifactRender
          canvasType={canvasType}
          mode="artifact"
          conversationId="yard-chat"
          messageId="answer-7"
          blockIndex={0}
          {...SHAPES[canvasType]}
        />
      </TooltipProvider>,
    );
  });
  await act(async () => {
    jest.advanceTimersByTime(50);
  });
}
async function unmount() {
  act(() => root.unmount());
  host.remove();
}

beforeEach(() => {
  mockDoor.rows = {};
  mockDoor.writes = [];
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

const settle = () => act(async () => { jest.advanceTimersByTime(900); });
const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
};
/** What the person sees: text, typed values and checked states. */
const snapshot = () =>
  [
    host.textContent,
    ...Array.from(host.querySelectorAll("input")).map((i) => (i as HTMLInputElement).value),
    ...Array.from(host.querySelectorAll("[aria-checked]")).map((e) => e.getAttribute("aria-checked")),
  ].join("|");
const byText = (selector: string, text: string) =>
  Array.from(host.querySelectorAll(selector)).filter((el) => el.textContent?.includes(text)).pop();

type Case = { kind: string; act: () => Promise<void>; durableKey?: string; shown?: () => string };

const DURABLE: Case[] = [
  { kind: "decision-tree", durableKey: "currentNodeId", act: () => click(host.querySelector('button[title="Yes"]')) },
  {
    kind: "troubleshooting",
    durableKey: "completedSteps",
    // Which issue is open is how the person is looking; the completed count is what they did.
    shown: () => /Completed(\d+)/.exec(host.textContent ?? "")?.[0] ?? "",
    act: async () => {
      await click(byText("button", "The yard scale reads zero"));
      await click(byText("button", "Reseat the cable"));
      // The step's own tick: the button beside its words.
      let row: Element | null | undefined = byText("p, span, div", "Unplug the scale cable");
      while (row && !Array.from(row.querySelectorAll(":scope > button")).length) row = row.parentElement;
      await click(row?.querySelector(":scope > button"));
    },
  },
  { kind: "progress", durableKey: "completed", act: () => click(byText("button", "Calibrate the scale")) },
  { kind: "recipe", durableKey: "checkedIngredients", act: () => click(byText("div[class*='cursor-pointer']", "ground beef")) },
  {
    kind: "quiz",
    durableKey: "quizState",
    act: () => click(byText('[data-testid="quiz-options"] button', "object")),
  },
  {
    kind: "questionnaire",
    durableKey: "formState",
    act: async () => {
      const input = host.querySelector('input[type="text"]') as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "about 120");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await settle();
    },
  },
];

const VIEW_ONLY: Case[] = [
  { kind: "presentation", act: () => click(host.querySelector('button[aria-label="Go to slide 2"]')) },
  { kind: "comparison", act: () => click(byText("th, [role='columnheader'], button", "Performance")) },
];

describe.each(DURABLE)("$kind: what the person does is written through the door", ({ kind, act: perform, durableKey, shown = snapshot }) => {
  it("writes the answer key, and a fresh mount (a reload) shows it back from the door alone", async () => {
    await mount(kind);
    await settle();
    const before = shown();
    const writesBefore = mockDoor.writes.length;
    await perform();

    const written = mockDoor.writes.slice(writesBefore).filter((w) => w.kind === kind);
    expect(written.length).toBeGreaterThan(0);
    expect(written.some((w) => durableKey! in w.patch)).toBe(true);
    const afterAction = shown();
    const rowAfterAction = JSON.stringify(mockDoor.rows[kind]);
    expect(afterAction).not.toBe(before);

    await unmount();
    const writesAtUnmount = mockDoor.writes.length;
    await mount(kind);
    await settle();
    expect(shown()).toBe(afterAction);
    // Putting it back never loses or changes what the door holds.
    expect(JSON.stringify(mockDoor.rows[kind])).toBe(rowAfterAction);
    // ...and is reading, not writing (every kind, the quiz included).
    expect(mockDoor.writes.length).toBe(writesAtUnmount);
    await unmount();
  });
});

describe.each(VIEW_ONLY)("$kind: how the person is looking never writes", ({ kind, act: perform }) => {
  it("changes the view, writes nothing", async () => {
    await mount(kind);
    await settle();
    const before = snapshot();
    await perform();
    expect(snapshot()).not.toBe(before);
    expect(mockDoor.writes).toEqual([]);
    expect(mockDoor.rows[kind]).toBeUndefined();
    await unmount();
  });
});
