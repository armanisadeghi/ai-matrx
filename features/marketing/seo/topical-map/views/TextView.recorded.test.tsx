/**
 * The Text view renders the recorded All Green tree as a markdown document
 * through the ONE markdown pipeline (MarkdownStream is stood in for by a
 * content-capturing stub — the test is about WHAT is handed to it, not how the
 * pipeline draws it), and Copy for AI hands an agent seo.map_outline's own
 * bytes, never the markdown.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import topicalMapReducer from "../redux/slice";
import type { TopicalMapKnobs } from "../knobs";
import { TextView } from "./TextView";
import {
  ALL_GREEN_MAP_ID,
  ALL_GREEN_WITH_COUNTS,
  ALL_GREEN_WITHOUT_COUNTS,
} from "./outline/__fixtures__/mapTreeAllGreen.recorded";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mapTree = jest.fn();
const mapOutline = jest.fn();
const getTopicalMap = jest.fn();
jest.mock("../data", () => ({
  __esModule: true,
  mapTree: (...args: unknown[]) => mapTree(...args),
  mapOutline: (...args: unknown[]) => mapOutline(...args),
  getTopicalMap: (...args: unknown[]) => getTopicalMap(...args),
  searchMapTopics: jest.fn(async () => []),
}));

const knobState: { knobs: TopicalMapKnobs | null; loading: boolean; error: Error | null } = {
  knobs: { outline_snippet_max_chars: 160 } as unknown as TopicalMapKnobs,
  loading: false,
  error: null,
};
jest.mock("../knobs", () => ({
  __esModule: true,
  useTopicalMapKnobs: () => knobState,
}));
jest.mock("@/features/assists/components/AssistStrip", () => ({
  __esModule: true,
  AssistStrip: () => null,
}));
jest.mock("./outline/text/TextOverridesPopover", () => ({
  __esModule: true,
  TextOverridesPopover: () => null,
}));
jest.mock("./outline/text/TextFocusPicker", () => ({
  __esModule: true,
  TextFocusPicker: () => null,
}));

let renderedMarkdown: string | null = null;
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content?: string }) => {
    renderedMarkdown = content ?? null;
    return <div data-markdown-stream>{content}</div>;
  },
}));

const copyProps: { human?: unknown; agent?: unknown } = {};
jest.mock("@/components/agent-copy/CopyButtons", () => ({
  __esModule: true,
  CopyButtons: (props: { human?: unknown; agent?: unknown }) => {
    copyProps.human = props.human;
    copyProps.agent = props.agent;
    return <span data-copy-buttons />;
  },
}));

function mount(): { container: HTMLDivElement; root: Root } {
  const store = configureStore({ reducer: { topicalMap: topicalMapReducer } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <TextView mapId={ALL_GREEN_MAP_ID} siteId={null} host="page" readOnly={false} />
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

beforeEach(() => {
  renderedMarkdown = null;
  copyProps.human = undefined;
  copyProps.agent = undefined;
  getTopicalMap.mockResolvedValue({ id: ALL_GREEN_MAP_ID, name: "All Green Recycling" });
  mapOutline.mockResolvedValue("AGENT OUTLINE BYTES");
});

describe("TextView — the recorded All Green tree as a markdown document", () => {
  it("hands the ONE markdown pipeline a document with the map title, one heading per root and the counts", async () => {
    mapTree.mockResolvedValue(ALL_GREEN_WITH_COUNTS);
    const { root } = mount();
    await flush();
    expect(renderedMarkdown).not.toBeNull();
    expect(renderedMarkdown?.startsWith("# All Green Recycling\n")).toBe(true);
    const roots = ALL_GREEN_WITH_COUNTS.topics;
    for (const topic of roots) expect(renderedMarkdown).toContain(`## ${topic.name}`);
    expect(renderedMarkdown).toMatch(/\d+ pages/);
    act(() => root.unmount());
  });

  it("prints no counts for a tree read without them", async () => {
    mapTree.mockResolvedValue(ALL_GREEN_WITHOUT_COUNTS);
    const { root } = mount();
    await flush();
    expect(renderedMarkdown).not.toBeNull();
    expect(renderedMarkdown).not.toMatch(/\d+ pages/);
    act(() => root.unmount());
  });

  it("Copy hands a person the markdown and Copy for AI hands an agent seo.map_outline's bytes", async () => {
    mapTree.mockResolvedValue(ALL_GREEN_WITH_COUNTS);
    const { root } = mount();
    await flush();
    expect(typeof copyProps.human).toBe("function");
    expect(typeof copyProps.agent).toBe("function");
    const human = (copyProps.human as () => string)();
    expect(human).toBe(renderedMarkdown);
    const agent = (copyProps.agent as () => string)();
    expect(agent).toBe("AGENT OUTLINE BYTES");
    expect(mapOutline).toHaveBeenCalledWith(ALL_GREEN_MAP_ID, { siteId: undefined, focusSlug: undefined });
    act(() => root.unmount());
  });
});
