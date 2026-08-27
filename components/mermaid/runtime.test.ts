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
});
