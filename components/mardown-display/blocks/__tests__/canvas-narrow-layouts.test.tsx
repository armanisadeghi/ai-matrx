/**
 * A tall, narrow canvas pane gets a layout built for it — and nothing changes
 * anywhere else (Arman: "when we have a lot of vertical space and little
 * horizontal space, the developer should TRY and see what they can do").
 *
 * `@ai-matrx/canvas` tells a body it is in a canvas pane through
 * `useCanvasPresentation()` (null everywhere else). Each case renders the REAL
 * block twice: outside the canvas (presentation null — the chat) and inside a
 * 360px-wide, 900px-tall pane. The narrow layout must engage in the pane and
 * must NOT engage outside it. Only the presentation hook and the app-wiring
 * hooks (redux, canvas opener, toasts) are doubles.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { canvasActions, createCanvasStore, type CanvasPresentation } from "@ai-matrx/canvas";
import { CanvasColumn, CanvasProvider, registerCanvasKind } from "@ai-matrx/canvas/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPresentation: CanvasPresentation | null = null;
jest.mock("@ai-matrx/canvas/react", () => ({
  // The real module (kind definitions etc. load through the task editor);
  // only the pane's presentation is a double.
  ...jest.requireActual("@ai-matrx/canvas/react"),
  useCanvasPresentation: () => mockPresentation,
}));
jest.mock("@ai-matrx/rich-content/display/blocks/canvas-fit", () => {
  const actual = jest.requireActual<typeof import("@ai-matrx/rich-content/display/blocks/canvas-fit")>(
    "@ai-matrx/rich-content/display/blocks/canvas-fit",
  );
  return {
    ...actual,
    useCanvasFit: () => actual.canvasFitFor(mockPresentation),
  };
});

jest.mock("next/dynamic", () => {
  const react = jest.requireActual("react") as typeof React;
  return (loader: () => Promise<{ default?: React.ComponentType } | React.ComponentType>) => {
    const Lazy = react.lazy(async () => {
      const mod = await loader();
      return {
        default:
          (mod as { default?: React.ComponentType }).default ??
          (mod as React.ComponentType),
      };
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
jest.mock("@ai-matrx/kit/media-query", () => ({
  ...jest.requireActual("@ai-matrx/kit/media-query"),
  useIsMobile: () => false,
}));
jest.mock("@/features/overlays/openers/tableViewerWindow", () => ({
  useOpenTableViewerWindow: () => jest.fn(),
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
jest.mock("@/features/tasks/components/ImportTasksModal", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@/features/block-state/useBlockState", () => ({
  useBlockState: () => ({ state: null, loaded: true, patch: jest.fn(), saveError: null, hosted: false }),
}));
jest.mock("@/features/canvas/hooks/useCanvasItem", () => ({
  useCanvasItem: () => ({
    row: { external_system: "fc_set", external_id: "set-1" },
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
  CANVAS_ITEM_UPDATED_EVENT: "canvas-item-updated",
}));
jest.mock("@/features/flashcards/data/useFlashcardStudy", () => ({
  useFlashcardStudy: () => ({
    set: { id: "set-1" },
    cards: [
      { id: "c1", front: "What does a recycler weigh scrap on?", back: "A certified scale", card_kind: "basic", details: [] },
      { id: "c2", front: "Which metal is magnetic?", back: "Steel", card_kind: "basic", details: [] },
    ],
    loading: false,
    error: null,
    currentIndex: 0,
    isFlipped: false,
    resultsByCard: {},
    next: jest.fn(),
    prev: jest.fn(),
    goTo: jest.fn(),
    flip: jest.fn(),
    grade: jest.fn(async () => true),
    grading: false,
    progress: { done: 0, total: 2, correct: 0 },
  }),
}));
jest.mock("@/features/canvas/components/CanvasArtifactDebugPanel", () => ({
  InlineArtifactDebugStrip: () => null,
}));
(globalThis as typeof globalThis & { ResizeObserver?: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};
if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
  // parseQuizJSON hashes the quiz; jsdom has no SubtleCrypto.
  Object.defineProperty(globalThis, "crypto", {
    value: jest.requireActual("node:crypto").webcrypto,
    configurable: true,
  });
}

import { StreamingTableRenderer } from "@ai-matrx/rich-content/display/blocks/table/StreamingTableRenderer";
import { MarkdownStreamingProvider } from "@ai-matrx/rich-content/markdown-core/streaming-context";
import ComparisonTableBlock from "@/components/mardown-display/blocks/comparison/ComparisonTableBlock";
import { createSampleComparisonTable } from "@/components/mardown-display/blocks/comparison/parseComparisonJSON";
import StatsBlock from "@/components/mardown-display/blocks/stats/StatsBlock";
import RecipeViewer from "@/components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay";
import { parseRecipeMarkdown } from "@/components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown";
import ResearchBlock from "@/components/mardown-display/blocks/research/ResearchBlock";
import { parseResearchMarkdown } from "@/components/mardown-display/blocks/research/parseResearchMarkdown";
import StructuredPlanViewer from "@/components/mardown-display/blocks/plan/StructuredPlanViewer";
import TaskChecklist from "@/components/mardown-display/blocks/tasks/TaskChecklist";
import MultipleChoiceQuiz from "@/components/mardown-display/blocks/quiz/MultipleChoiceQuiz";
import { CanvasFlashcardsView } from "@/features/flashcards/components/CanvasFlashcardsView";
import { canvasFitFor } from "@ai-matrx/rich-content/display/blocks/canvas-fit";
import { TooltipProvider } from "@/components/ui/tooltip";

const TABLE = [
  "| Yard | Material | Price per ton | Note |",
  "| --- | --- | --- | --- |",
  "| North | Steel | $210 | weighed on arrival |",
  "| South | Aluminum | $1,450 | clean only |",
].join("\n");
const TABLE_KIND = "canvas-narrow-table-test";
const unregisterTableKind = registerCanvasKind({
  id: TABLE_KIND,
  label: "Table test",
  surface: "dom",
  icon: () => null,
  component: () => (
    <MarkdownStreamingProvider value={false}>
      <StreamingTableRenderer content={TABLE} isStreamActive={false} />
    </MarkdownStreamingProvider>
  ),
});
afterAll(() => unregisterTableKind());

function pane(width: number, height: number, isFullscreen = false): CanvasPresentation {
  return {
    host: "canvas",
    width,
    height,
    orientation: width / height >= 1.2 ? "landscape" : width / height <= 1 / 1.2 ? "portrait" : "square",
    isNarrow: width > 0 && width < 480,
    isFullscreen,
    paneCount: 1,
  };
}
const NARROW = pane(360, 900);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockPresentation = null;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function show(node: React.ReactElement, presentation: CanvasPresentation | null) {
  mockPresentation = presentation;
  await act(async () => {
    // The app shell provides one TooltipProvider for every block.
    root.render(<TooltipProvider>{node}</TooltipProvider>);
  });
  // Let async parsers (quiz hash) and lazy chunks settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function showPackageTable(width: number, height: number, isFullscreen = false) {
  const store = createCanvasStore();
  store.dispatch(canvasActions.open({ kind: TABLE_KIND, key: "table" }));
  const getRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains("mxc-pane-slot")) {
      return {
        x: 0, y: 0, left: 0, top: 0, right: width, bottom: height,
        width, height, toJSON: () => ({}),
      } as DOMRect;
    }
    return getRect.call(this);
  };
  try {
    await act(async () => {
      root.render(
        <CanvasProvider store={store} persistence={null} hotkeys={false}>
          <CanvasColumn placement="fill" />
        </CanvasProvider>,
      );
    });
    if (isFullscreen) {
      await act(async () => {
        store.dispatch(canvasActions.setFullscreen(true));
      });
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  } finally {
    HTMLElement.prototype.getBoundingClientRect = getRect;
  }
}

describe("canvasFitFor", () => {
  it("is outside without a presentation, narrow under 480, tight under 768, wide when full screen", () => {
    expect(canvasFitFor(null)).toBe("outside");
    expect(canvasFitFor(pane(360, 900))).toBe("narrow");
    expect(canvasFitFor(pane(630, 900))).toBe("tight");
    expect(canvasFitFor(pane(630, 900, true))).toBe("wide");
    expect(canvasFitFor(pane(1200, 900))).toBe("wide");
  });
});

describe("table", () => {
  const render = () => (
    <MarkdownStreamingProvider value={false}>
      <StreamingTableRenderer content={TABLE} isStreamActive={false} />
    </MarkdownStreamingProvider>
  );

  it("reads as labelled cards in a narrow pane, and as the grid outside the canvas", async () => {
    await show(render(), null);
    expect(container.querySelector("table")?.getAttribute("data-canvas-fit")).toBeNull();
    // The card list is ONE container query (`.phone-stack`): the labels are always
    // in the markup, and only the wrapper's own width turns them into cards.

    await showPackageTable(360, 900);
    expect(container.querySelector("table")?.getAttribute("data-canvas-fit")).toBe("narrow");
    const labels = Array.from(container.querySelectorAll("tbody tr:first-child td[data-label]")).map(
      (td) => td.getAttribute("data-label"),
    );
    expect(labels).toEqual(["Material", "Price per ton", "Note"]);
    expect(container.querySelector("tbody td[data-phone='lead']")?.textContent).toContain("North");
    expect(container.querySelector("table")?.parentElement?.className).toContain("phone-stack");
  });

  it("pins the first column in a tight pane and not when that pane is full screen", async () => {
    await showPackageTable(630, 900);
    expect(container.querySelector("tbody td")?.className).toContain("sticky");
    await showPackageTable(630, 900, true);
    expect(container.querySelector("tbody td")?.className).not.toContain("sticky");
  });
});

describe("comparison", () => {
  it("shows one item per card in a narrow pane, and the side-by-side table outside", async () => {
    const data = createSampleComparisonTable();
    await show(<ComparisonTableBlock comparison={data} />, null);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("[data-testid='comparison-cards']")).toBeNull();

    await show(<ComparisonTableBlock comparison={data} />, NARROW);
    expect(container.querySelector("table")).toBeNull();
    const cards = container.querySelector("[data-testid='comparison-cards']");
    expect(cards).not.toBeNull();
    expect(cards?.querySelectorAll("dl").length).toBe(data.items.length);
  });
});

describe("stats", () => {
  const SPEC = JSON.stringify({
    title: "Yard this month",
    stats: [
      { label: "Tons in", value: "1,240" },
      { label: "Tons out", value: "1,180" },
      { label: "Revenue", value: "$412k", change: "+8%" },
      { label: "Trucks", value: "312" },
    ],
  });
  const grid = () => container.querySelector("[data-canvas-fit], .grid") as HTMLElement | null;

  it("stacks the tiles in one column in a narrow pane, four across outside", async () => {
    await show(<StatsBlock content={SPEC} />, null);
    expect(grid()?.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    await show(<StatsBlock content={SPEC} />, NARROW);
    expect(grid()?.style.gridTemplateColumns).toBe("repeat(1, minmax(0, 1fr))");
  });
});

describe("recipe", () => {
  const RECIPE = [
    "### Lemon Rice",
    "",
    "**Prep Time:** 10 minutes",
    "**Cook Time:** 20 minutes",
    "**Servings:** 4",
    "",
    "#### Ingredients:",
    "- 1 cup rice",
    "- 1 lemon",
    "",
    "#### Instructions:",
    "1. Cook the rice.",
    "2. Stir in the lemon.",
  ].join("\n");

  it("wraps the quick stats two per row and keeps ingredients above the steps in a narrow pane", async () => {
    const recipe = parseRecipeMarkdown(RECIPE);
    expect(recipe).not.toBeNull();
    await show(<RecipeViewer recipe={recipe!} />, null);
    const stats = () => container.querySelector("[data-testid='recipe-quick-stats']");
    expect(stats()?.className).toContain("grid-cols-4");
    expect(container.innerHTML).toContain("@[550px]:grid-cols-2");

    await show(<RecipeViewer recipe={recipe!} />, NARROW);
    expect(stats()?.className).toContain("grid-cols-2");
    expect(stats()?.className).not.toContain("grid-cols-4");
    expect(container.innerHTML).not.toContain("@[550px]:grid-cols-2");
  });
});

describe("research", () => {
  const RESEARCH = [
    "# Scrap Metal Pricing Study",
    "",
    "## Overview",
    "How yards set prices.",
    "",
    "**Research Scope:** Southern California",
    "**Key Focus Areas:** Steel, aluminum",
    "**Analysis Period:** 2026",
    "",
    "## Executive Summary",
    "Prices follow the LME with a lag.",
  ].join("\n");

  it("reads columns from the pane (a size container) in the canvas and from the viewport outside", async () => {
    const research = parseResearchMarkdown(RESEARCH);
    expect(research).not.toBeNull();
    await show(<ResearchBlock research={research!} />, null);
    expect(container.querySelector("[data-canvas-fit]")).toBeNull();
    expect(container.querySelector(".\\@container")).toBeNull();
    expect(container.innerHTML).toContain("lg:flex-row");

    await show(<ResearchBlock research={research!} />, NARROW);
    expect(container.querySelector("[data-canvas-fit='narrow']")?.className).toContain("@container");
    expect(container.innerHTML).not.toContain("lg:flex-row");
    expect(container.innerHTML).toContain("@5xl:flex-row");
    expect(container.querySelector("h1")?.className).toContain("text-xl");
  });
});

describe("structured info", () => {
  const PLAN = "## Phase 1\n- Weigh the load\n- Pay the seller\n\n## Phase 2\n- Sort by grade";

  it("tightens the card and wraps its counts in a narrow pane only", async () => {
    await show(<StructuredPlanViewer content={PLAN} onCopySection={() => {}} />, null);
    expect(container.querySelector("[data-canvas-fit]")).toBeNull();
    expect(container.innerHTML).not.toContain("flex-wrap gap-x-3");

    await show(<StructuredPlanViewer content={PLAN} onCopySection={() => {}} />, NARROW);
    expect(container.querySelector("[data-canvas-fit='narrow']")).not.toBeNull();
    expect(container.innerHTML).toContain("flex-wrap gap-x-3");
  });
});

describe("tasks", () => {
  const TASKS = "- [ ] Weigh the truck\n  - [ ] Print the ticket\n- [x] Open the yard";

  it("wraps the toolbar compactly and indents subtasks less in a narrow pane", async () => {
    await show(<TaskChecklist content={TASKS} hideTitle hideActions />, null);
    const toolbar = () => container.querySelector("[data-testid='task-checklist-toolbar']");
    expect(toolbar()?.className).not.toContain("flex-wrap");
    expect(container.querySelector(".ml-8")).not.toBeNull();

    await show(<TaskChecklist content={TASKS} hideTitle hideActions />, NARROW);
    expect(toolbar()?.className).toContain("flex-wrap");
    expect(container.querySelector(".ml-8")).toBeNull();
    expect(container.querySelector(".ml-5")).not.toBeNull();
  });
});

describe("quiz", () => {
  const QUIZ = {
    quizTitle: "Yard safety",
    multipleChoice: [
      {
        id: 1,
        question: "What do you wear on the scale deck?",
        options: ["Steel-toe boots", "Sandals", "Slippers", "Nothing special"],
        correctAnswer: 0,
        explanation: "Steel-toe boots protect against dropped loads.",
      },
    ],
  };

  it("stacks options one per row and never opens focus mode by itself in a narrow pane", async () => {
    await show(<MultipleChoiceQuiz quizData={QUIZ} />, null);
    const options = () => container.querySelector("[data-testid='quiz-options']");
    expect(options()?.className).toContain("md:grid-cols-2");

    await show(<MultipleChoiceQuiz quizData={QUIZ} />, NARROW);
    expect(options()?.className).not.toContain("md:grid-cols-2");
    expect(options()?.getAttribute("data-canvas-fit")).toBe("narrow");
    expect(document.querySelector("[aria-label='Close fullscreen mode']")).toBeNull();
  });
});

describe("flashcards", () => {
  it("spans the pane with a wrapping header in a narrow pane and never auto-opens a full-screen deck", async () => {
    await show(<CanvasFlashcardsView artifactId="11111111-1111-4111-8111-111111111111" />, null);
    const header = () => container.querySelector("[data-testid='canvas-flashcards-header']");
    expect(header()?.className).not.toContain("flex-wrap");
    expect(container.textContent).toContain("Open in Flashcards");

    await show(<CanvasFlashcardsView artifactId="11111111-1111-4111-8111-111111111111" />, NARROW);
    expect(header()?.getAttribute("data-canvas-fit")).toBe("narrow");
    expect(header()?.className).toContain("flex-wrap");
    expect(container.querySelector("a[aria-label='Open in Flashcards']")?.textContent).toBe("");
    expect(container.textContent).toContain("What does a recycler weigh scrap on?");
  });
});
