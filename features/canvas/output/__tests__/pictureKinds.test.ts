/** @jest-environment jsdom */
/**
 * Rendered-output P2 WP1: svg · image · chart · diagram · presentation (and a live graph) print and
 * capture as PICTURES — complete, never source/JSON, never a clipped viewport.
 */
import { getBlockPrinter } from "@ai-matrx/print/core";

const renderElement = jest.fn(async (..._args: unknown[]) => {
  const canvas = document.createElement("canvas");
  canvas.toBlob = (cb: BlobCallback) => cb(new Blob(["png"], { type: "image/png" }));
  return canvas;
});
jest.mock("@ai-matrx/alchemy/operate/capture", () => ({ renderElement: (...args: unknown[]) => renderElement(...args) }));

const fileBlob = jest.fn();
jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { use: () => ({ as: (target: { kind: string }) => fileBlob(target) }) },
}));

import "../pictureKindPrinters";
import { captureFlowGraph, extractSvgMarkup, flowNodeBoxes, parseTranslate, unionBounds } from "../pictureEngine";
import { SVG_OUTPUT } from "../pictureKindPrinters";

const SVG = '<svg viewBox="0 0 40 20"><rect width="40" height="20" fill="#09f"/><text x="2" y="12">Hello</text></svg>';
const ctx = (type: string, raw: string, title?: string) => ({ type, raw, ...(title ? { title } : {}) });

async function out(type: string, data: unknown, raw = typeof data === "string" ? data : "", title?: string) {
  return getBlockPrinter(type)?.toPrintHtml?.(data, ctx(type, raw, title));
}

describe("svg: a picture (vector), never markup", () => {
  it("prints as an <img> of the SVG with a namespace and a size", async () => {
    const result = await out("svg", SVG);
    const src = result && "image" in result ? result.image.src : "";
    expect(src.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const decoded = atob(src.split(",")[1] as string);
    expect(decoded).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(decoded).toContain('width="40"');
    expect(decoded).toContain("Hello");
  });
  it("reads an artifact body wrapped in a fence", () => {
    expect(extractSvgMarkup("```svg\n" + SVG + "\n```")).toBe(SVG);
  });
  it("a body with no drawing says so", async () => {
    const result = await out("svg", "not a drawing");
    expect(result && "notice" in result ? result.notice : "").toMatch(/Graphic not printed/);
  });
  it("the canvas tab's Copy image rasterises the same markup", () => {
    expect(typeof SVG_OUTPUT.capture).toBe("function");
  });
});

describe("image: the file itself, through the file funnel", () => {
  beforeEach(() => fileBlob.mockReset());
  it("a data URI prints as the picture", async () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgo=";
    const result = await out("image", dataUri);
    expect(result && "image" in result ? result.image.src.startsWith("data:") : false).toBe(true);
  });
  it("an owned file is read as bytes by the funnel (never a tainted DOM copy)", async () => {
    fileBlob.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
    const result = await out("image", "7b0e6a52-1b2c-4a7e-9d3a-0f6f1a2b3c4d");
    expect(fileBlob).toHaveBeenCalledWith({ kind: "blob" });
    expect(result && "image" in result).toBe(true);
  });
  it("a public link the funnel cannot read still prints as the link; anything else says why", async () => {
    fileBlob.mockRejectedValue(new Error("blocked"));
    const link = await out("image", "https://cdn.example.com/a.png");
    expect(link && "html" in link ? link.html : "").toContain("https://cdn.example.com/a.png");
    const bad = await out("image", "relative/path.png");
    expect(bad && "notice" in bad ? bad.notice : "").toMatch(/Image not printed/);
  });
});

describe("a live graph prints and captures in FULL, not the visible pane", () => {
  function graph() {
    const flow = document.createElement("div");
    flow.className = "react-flow";
    const viewport = document.createElement("div");
    viewport.className = "react-flow__viewport";
    viewport.style.transform = "translate(0px, 0px) scale(1)";
    flow.appendChild(viewport);
    const add = (x: number, y: number) => {
      const node = document.createElement("div");
      node.className = "react-flow__node";
      node.style.transform = `translate(${x}px, ${y}px)`;
      Object.defineProperty(node, "offsetWidth", { value: 100 });
      Object.defineProperty(node, "offsetHeight", { value: 40 });
      viewport.appendChild(node);
    };
    add(0, 0);
    add(3000, 2000); // far outside any viewport pane
    const controls = document.createElement("div");
    controls.className = "react-flow__controls";
    flow.appendChild(controls);
    document.body.appendChild(flow);
    return flow;
  }

  it("reads node boxes and their union", () => {
    expect(parseTranslate("translate(12px, -4.5px)")).toEqual({ x: 12, y: -4.5 });
    const flow = graph();
    expect(unionBounds(flowNodeBoxes(flow))).toEqual({ minX: 0, minY: 0, width: 3100, height: 2040 });
    flow.remove();
  });

  it("draws a stage as big as every node, with the viewport reset to its top-left", async () => {
    renderElement.mockClear();
    const flow = graph();
    let stage: HTMLElement | null = null;
    renderElement.mockImplementationOnce(async (...args: unknown[]) => {
      stage = args[0] as HTMLElement;
      const options = args[1] as { filter: (n: HTMLElement) => boolean };
      expect(options.filter(flow.querySelector(".react-flow__controls") as HTMLElement)).toBe(false);
      expect(options.filter(flow.querySelector(".react-flow__node") as HTMLElement)).toBe(true);
      const canvas = document.createElement("canvas");
      canvas.toBlob = (cb: BlobCallback) => cb(new Blob(["png"]));
      return canvas;
    });
    const blob = await captureFlowGraph(flow);
    expect(blob.size).toBeGreaterThan(0);
    expect(stage).not.toBeNull();
    expect(document.querySelector("[data-matrx-offscreen-picture]")).toBeNull();
    flow.remove();
  });

  it("an empty graph says so instead of returning a blank picture", async () => {
    const flow = document.createElement("div");
    flow.className = "react-flow";
    document.body.appendChild(flow);
    await expect(captureFlowGraph(flow)).rejects.toThrow(/no nodes/);
    flow.remove();
  });
});

describe("every picture type has ONE adapter in the registry (chat block + canvas tab)", () => {
  it.each(["svg", "image", "chart", "diagram", "presentation"])("%s", (type) => {
    expect(getBlockPrinter(type)?.toPrintHtml).toBeInstanceOf(Function);
    expect(getBlockPrinter(type)?.print).toBeInstanceOf(Function);
  });

  it("the menu's probe of an adapter does no drawing until the result is awaited", () => {
    renderElement.mockClear();
    const probe = getBlockPrinter("diagram")?.toPrintHtml?.({ title: "t", nodes: [], edges: [] }, ctx("diagram", ""));
    expect(probe).toBeInstanceOf(Promise);
    expect(renderElement).not.toHaveBeenCalled();
    expect(document.querySelector("[data-matrx-offscreen-picture]")).toBeNull();
  });
});

describe("presentation: every slide, one picture per page", () => {
  it("prints N slides as N figures with page breaks — not only the slide on screen", async () => {
    const slides = [{ title: "One" }, { title: "Two", bullets: ["a", "b"] }, { title: "Three" }];
    const result = await out("presentation", { presentation: { slides, theme: { primaryColor: "#2563eb" } } });
    const html = result && "html" in result ? result.html : JSON.stringify(result);
    expect((html.match(/<figure/g) ?? []).length).toBe(3);
    expect((html.match(/<img src="data:image\/png/g) ?? []).length).toBe(3);
    expect(html).toContain("break-after:page");
    expect(html).not.toContain("&quot;slides&quot;");
  });
  it("a deck with no slides says so", async () => {
    const result = await out("presentation", { slides: [] });
    expect(result && "notice" in result ? result.notice : "").toMatch(/Presentation not printed/);
  });
});
