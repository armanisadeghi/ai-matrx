const mockInitialize = jest.fn();
const mockParse = jest.fn().mockResolvedValue(true);
const mockRender = jest.fn(async (id: string) => ({
  svg: `<svg data-render-id="${id}"></svg>`,
}));
const mockRegisterLayoutLoaders = jest.fn();

jest.mock("mermaid", () => ({
  __esModule: true,
  default: {
    initialize: mockInitialize,
    parse: mockParse,
    render: mockRender,
    registerLayoutLoaders: mockRegisterLayoutLoaders,
  },
}));

jest.mock(
  "@mermaid-js/layout-elk",
  () => ({
    __esModule: true,
    default: [],
  }),
  { virtual: true },
);

import { renderMermaid } from "./runtime";

const DAGRE = {
  theme: "default",
  look: "classic",
  layout: "dagre",
} as const;

describe("Mermaid runtime render scheduling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("coalesces in-flight identical renders and reuses the bounded cache", async () => {
    const source = "flowchart TD\n  cache_a --> cache_b";

    const [first, second] = await Promise.all([
      renderMermaid(source, DAGRE),
      renderMermaid(source, DAGRE),
    ]);
    const third = await renderMermaid(source, DAGRE);

    expect(first).toEqual(second);
    expect(third).toEqual(first);
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it("loads and registers ELK only when an ELK render is requested", async () => {
    await renderMermaid("flowchart TD\n  dagre_a --> dagre_b", DAGRE);
    expect(mockRegisterLayoutLoaders).not.toHaveBeenCalled();

    await renderMermaid("flowchart TD\n  elk_a --> elk_b", {
      ...DAGRE,
      layout: "elk",
    });
    expect(mockRegisterLayoutLoaders).toHaveBeenCalledTimes(1);
  });

  it("skips queued work superseded by newer source from the same renderer", async () => {
    let releaseBlocker: ((value: { svg: string }) => void) | undefined;
    const blockerGate = new Promise<{ svg: string }>((resolve) => {
      releaseBlocker = resolve;
    });
    mockRender.mockImplementationOnce(() => blockerGate);

    const blocker = renderMermaid(
      "flowchart TD\n  blocker_a --> blocker_b",
      DAGRE,
      "blocker",
    );
    const stale = renderMermaid(
      "flowchart TD\n  stale_a --> stale_b",
      DAGRE,
      "editor",
    );
    const current = renderMermaid(
      "flowchart TD\n  current_a --> current_b",
      DAGRE,
      "editor",
    );

    releaseBlocker?.({ svg: '<svg data-render-id="blocker"></svg>' });
    await blocker;
    await expect(stale).rejects.toMatchObject({
      name: "MermaidRenderSupersededError",
    });
    await current;

    expect(mockRender).toHaveBeenCalledTimes(2);
  });

  it("draws a pie with the chart palette and the requested legend position", async () => {
    const source = "pie\n  \"a\": 1\n  \"b\": 2";
    await renderMermaid(source, { ...DAGRE, theme: "dark", pieLegend: "bottom" });
    const dark = mockInitialize.mock.calls.at(-1)?.[0];
    expect(dark.pie).toEqual({ legendPosition: "bottom" });
    expect(dark.themeVariables.pie1).toBe("#3987e5");

    // A different legend position is a different drawing, never a cache hit.
    await renderMermaid(source, { ...DAGRE, theme: "dark", pieLegend: "right" });
    expect(mockRender).toHaveBeenCalledTimes(2);
    expect(mockInitialize.mock.calls.at(-1)?.[0].pie).toEqual({
      legendPosition: "right",
    });

    // An explicitly chosen mermaid theme keeps its own slice colours.
    await renderMermaid(source, { ...DAGRE, theme: "forest" });
    expect(mockInitialize.mock.calls.at(-1)?.[0].themeVariables).toBeUndefined();
  });
});
