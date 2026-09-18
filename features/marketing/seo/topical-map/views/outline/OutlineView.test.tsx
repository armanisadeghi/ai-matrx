/**
 * views/outline/OutlineView.test.tsx — the REAL `OutlineView` mounted over a
 * real Redux store and a real TanStack client, with the data layer's wrappers
 * mocked at `data.ts` (the seam every hook calls) so the real reducer, the
 * real selectors and the real `TopicTree` all run.
 *
 * Watched failing first:
 *   · rows: `OutlineBody` rendered before `mapTreeLoaded` landed → no rows;
 *   · rename: `onRenameCommit` not passed to the tree → F2 opens nothing;
 *   · verbatim: the banner rendering `error.message` instead of the RPC
 *     sentence → the sentence is missing;
 *   · readOnly: `onRenameCommit` passed regardless of `readOnly` → F2 opens
 *     an editor for a viewer;
 *   · hover knob: `renderHover` passed regardless of the knob → a HoverCard
 *     trigger exists with the knob off.
 *
 * Mocked (with the reason): `AssistStrip` (reads the auth + assists slices),
 * `NonEditableContextMenu` (the v3 menu reads a dozen slices; the section it
 * gets is built by `buildTopicMenuSection`, tested elsewhere), `EntityRef`
 * (entity registry + a dynamic peek host), `useOpenTopicPanel` (overlay slice),
 * `useClippedContentGuard` (layout timing), `@/lib/toast` (sonner).
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import topicalMapReducer from "../../redux/slice";
import type { TopicalMapKnobs } from "../../knobs";
import { OutlineView } from "../OutlineView";
import { MAP_ID, TREE_WITH_COUNTS } from "./__fixtures__/mapTreeShape";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships neither `matchMedia` (useIsMobile, the tree's coarse-pointer
// check) nor `ResizeObserver` (Radix). A fine, non-mobile pointer is the
// desktop the outline is designed for.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const RPC_SENTENCE =
  "patch_map_topics: name cannot be empty for topic electronics-recycling (22023)";

const patchMapTopics = jest.fn();
const mapTree = jest.fn();
const mapDiagnostics = jest.fn();

jest.mock("../../data", () => ({
  __esModule: true,
  mapTree: (...args: unknown[]) => mapTree(...args),
  mapDiagnostics: (...args: unknown[]) => mapDiagnostics(...args),
  patchMapTopics: (...args: unknown[]) => patchMapTopics(...args),
  mapTopicAssociations: jest.fn(async () => []),
  searchMapTopics: jest.fn(async () => []),
  moveMapTopic: jest.fn(),
  retireMapTopics: jest.fn(),
  rejectMapTopics: jest.fn(),
}));

const knobState: { knobs: TopicalMapKnobs | null; loading: boolean; error: Error | null } = {
  knobs: null,
  loading: false,
  error: null,
};
jest.mock("../../knobs", () => ({
  __esModule: true,
  useTopicalMapKnobs: () => knobState,
}));

jest.mock("@/features/assists/components/AssistStrip", () => ({
  __esModule: true,
  AssistStrip: () => null,
}));
jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  __esModule: true,
  NonEditableContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  __esModule: true,
  EntityRef: ({ name }: { name?: string | null }) => <span data-entity-ref>{name}</span>,
}));
const openTopicPanel = jest.fn();
jest.mock("@/features/overlays/openers/topicalMapTopicPanel", () => ({
  __esModule: true,
  useOpenTopicPanel: () => openTopicPanel,
}));
jest.mock("@/lib/layout/useClippedContentGuard", () => ({
  __esModule: true,
  useClippedContentGuard: () => undefined,
}));
jest.mock("@/lib/toast", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog", () => ({
  __esModule: true,
  ClipboardFallbackDialog: () => null,
}));

function knobs(overrides: Partial<TopicalMapKnobs> = {}): TopicalMapKnobs {
  return {
    outline_detail: "labels",
    outline_hover_popover: true,
    outline_intent_dots: true,
    outline_description_max_chars: 120,
    intent_colors: {
      in_place: "green",
      leaving: "amber",
      arriving: "blue",
      delete: "red",
      missing: "gray_dashed",
      planned: "purple_dashed",
    },
    ...overrides,
  } as TopicalMapKnobs;
}

function mount(readOnly = false): { container: HTMLDivElement; root: Root } {
  const store = configureStore({ reducer: { topicalMap: topicalMapReducer } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <OutlineView mapId={MAP_ID} siteId={null} host="page" readOnly={readOnly} />
        </QueryClientProvider>
      </Provider>,
    );
  });
  return { container, root };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function tree(container: HTMLElement): HTMLElement {
  const element = container.querySelector('[role="tree"]');
  if (!(element instanceof HTMLElement)) throw new Error("no tree rendered");
  return element;
}

function press(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

function rowLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="treeitem"]')).map(
    (row) => row.querySelector("span.truncate")?.textContent ?? "",
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  knobState.knobs = knobs();
  knobState.loading = false;
  knobState.error = null;
  mapTree.mockResolvedValue(TREE_WITH_COUNTS);
  mapDiagnostics.mockResolvedValue({
    topics_total: 6,
    topics_empty: 1,
    topics_empty_sample: ["laptop-recycling"],
    topics_crowded: [],
    topics_proposed: ["data-destruction", "degaussing"],
    pages_on_many_topics: [],
    pages_on_no_topic: 0,
    pages_on_no_topic_sample: [],
    retired_with_attachments: [],
    sites_using_map: ["d0aff5b6-0710-4848-8304-164db3c80ab7"],
  });
});

describe("OutlineView", () => {
  it("renders the fixture's roots from the store, with the proposed mark", async () => {
    const { container, root } = mount();
    await flush();
    expect(rowLabels(container)).toEqual([
      "Electronics recycling",
      "Data destruction",
      "About All Green",
    ]);
    const proposedRow = container.querySelector('[data-topic-tree-row="data-destruction"]');
    expect(proposedRow?.textContent).toContain("Proposed");
    // The diagnostics footer carries the function's numbers.
    expect(container.textContent).toContain("2 still proposed");
    act(() => root.unmount());
  });

  it("F2 on the selected row edits in place and commits through patch_map_topics; a refusal shows the RPC sentence verbatim", async () => {
    const cause = Object.assign(new Error("boom"), { code: "22023", message: RPC_SENTENCE });
    patchMapTopics.mockRejectedValue(cause);
    const { container, root } = mount();
    await flush();

    const first = container.querySelector('[data-topic-tree-row="electronics-recycling"]');
    act(() => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    press(tree(container), "F2");
    const input = container.querySelector('input[aria-label="Rename"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Electronics and e-waste");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    console.log("DEBUG value after set:", (input as HTMLInputElement).value);
    press(input as HTMLElement, "Enter");
    await flush();
    console.log("DEBUG editor still open:", Boolean(container.querySelector('input[aria-label="Rename"]')), "calls:", patchMapTopics.mock.calls.length, "alert:", container.querySelector('[role="alert"]')?.textContent);

    expect(patchMapTopics).toHaveBeenCalledWith(MAP_ID, [
      { slug: "electronics-recycling", name: "Electronics and e-waste" },
    ]);
    const banner = container.querySelector('[role="alert"]');
    expect(banner?.textContent).toContain(RPC_SENTENCE);
    expect(banner?.textContent).toContain('renaming "Electronics recycling"');
    act(() => root.unmount());
  });

  it("readOnly: F2 opens no editor, and the read-only door to the topic panel stays", async () => {
    const { container, root } = mount(true);
    await flush();
    const first = container.querySelector('[data-topic-tree-row="electronics-recycling"]');
    act(() => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    press(tree(container), "F2");
    expect(container.querySelector('input[aria-label="Rename"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Open Electronics recycling"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("`outline_hover_popover = false` renders no hover-card trigger", async () => {
    knobState.knobs = knobs({ outline_hover_popover: false });
    const { container, root } = mount();
    await flush();
    expect(container.querySelector("[data-state][data-slot], [data-radix-hover-card-trigger]")).toBeNull();
    expect(container.querySelectorAll('[role="treeitem"] a, [role="treeitem"] [data-state]').length).toBe(0);
    act(() => root.unmount());
  });

  it("a knob read failure renders the failure, never the tree", async () => {
    knobState.knobs = null;
    knobState.error = new Error('Missing feature knob "seo.topical_map.outline_detail".');
    const { container, root } = mount();
    await flush();
    expect(container.querySelector('[role="tree"]')).toBeNull();
    expect(container.textContent).toContain('Missing feature knob "seo.topical_map.outline_detail".');
    act(() => root.unmount());
  });
});
