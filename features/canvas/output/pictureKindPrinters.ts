"use client";

/**
 * Print + capture adapters for the picture-shaped artifact types (rendered-output
 * P2 WP1): svg, image, chart, diagram, presentation (and a topical map's graph,
 * canvas-only). One adapter per type in `@ai-matrx/print`'s one block-printer
 * registry, used by BOTH callers — the chat message's Print (`toPrintHtml`) and
 * the canvas tab's Print / Copy image / Attach screenshot (`PICTURE_OUTPUT`) —
 * so a block never prints as its source on one surface and as itself on another.
 *
 *   svg          — an `<img>` of the markup (vector in the print, runs no script)
 *   image        — the file itself, read through the file funnel (never a tainted DOM copy)
 *   chart        — the recharts drawing, picture of it
 *   diagram      — the WHOLE graph (every node), fitted — never the visible pane
 *   presentation — EVERY slide, one picture per page
 *
 * A live graph (a diagram or topical-map tab) is captured from the tab itself
 * (`captureFlowGraph`), so the picture is what the viewer sees, in full.
 */

import { createElement } from "react";
import {
  buildPrintDocument,
  openPendingPrintWindow,
  printBlockOutputHtml,
  printElement,
  printHtmlContent,
  registerBlockPrinter,
  type BlockPrinter,
  type PrintBlockContext,
  type PrintBlockOutput,
} from "@ai-matrx/print/core";
import { escapeHtml } from "@ai-matrx/kit/html-escape";
import type { CanvasKind, CanvasOutputRequest } from "@ai-matrx/canvas/react";
import { fileHandler } from "@/features/files/handler/handler";
import { contentOf, readArtifactItemData } from "@/features/canvas/host/artifactItem";
import { blobToDataUrl } from "./capturePort";
import { printCapturedImage } from "./printCapture";
import {
  captureFlowGraph,
  elementPicture,
  extractSvgMarkup,
  findFlow,
  flowNodeBoxes,
  pageBackground,
  renderNodePicture,
  svgMarkupToDataUrl,
  svgMarkupToImage,
  withOffscreen,
} from "./pictureEngine";

// ─── reading a block's data ──────────────────────────────────────────────────

const FENCED = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\s*\1\s*$/;

/** The block's text body (an `<artifact>` body may wrap its source in a fence). */
function sourceText(data: unknown, context?: Pick<PrintBlockContext, "raw">): string {
  const text = context?.raw?.trim() ? context.raw : typeof data === "string" ? data : "";
  const fenced = FENCED.exec(text);
  return (fenced ? (fenced[2] as string) : text).trim();
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The block's JSON payload: the parsed data when it is an object, else the parsed source text. */
function jsonPayload<T>(data: unknown, context?: Pick<PrintBlockContext, "raw">): T | null {
  if (data && typeof data === "object") return data as T;
  return parseJson<T>(sourceText(data, context));
}

/**
 * A promise that does its work only when somebody awaits it. The canvas menu
 * probes `toPrintHtml` (to learn whether an adapter exists) every time it is
 * built; a drawing off screen must not start for a probe nobody reads.
 */
class LazyOutput extends Promise<PrintBlockOutput> {
  static override get [Symbol.species]() {
    return Promise;
  }
  private started: Promise<PrintBlockOutput> | null = null;
  private readonly run: () => Promise<PrintBlockOutput>;
  constructor(run: () => Promise<PrintBlockOutput>) {
    super(() => undefined);
    this.run = run;
  }
  override then<A = PrintBlockOutput, B = never>(
    onfulfilled?: ((value: PrintBlockOutput) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    this.started ??= this.run();
    return this.started.then(onfulfilled, onrejected);
  }
}

const lazyOutput = (run: () => Promise<PrintBlockOutput>): Promise<PrintBlockOutput> => new LazyOutput(run);

const cannot = (what: string, why: string): PrintBlockOutput => ({ notice: `${what} not printed: ${why}.` });

async function pictureOutput(make: () => Promise<Blob>, alt: string): Promise<PrintBlockOutput> {
  try {
    return { image: { src: await blobToDataUrl(await make()), alt } };
  } catch (error) {
    return cannot(alt, error instanceof Error ? error.message : "the picture could not be made");
  }
}

// ─── svg ─────────────────────────────────────────────────────────────────────

const svgImageHtml = (src: string, alt: string) =>
  `<img src="${src}" alt="${escapeHtml(alt)}" style="display:block;max-width:100%;height:auto;margin:8px auto">`;

export const svgPrinter: BlockPrinter = {
  label: "Print graphic",
  variants: [],
  print(data) {
    const svg = extractSvgMarkup(sourceText(data));
    if (!svg) throw new Error("this graphic has no drawing to print");
    printHtmlContent(svgImageHtml(svgMarkupToDataUrl(svg), "Graphic"), "Graphic");
  },
  toPrintHtml(data, context): PrintBlockOutput {
    const svg = extractSvgMarkup(sourceText(data, context));
    if (!svg) return cannot("Graphic", "it has no drawing");
    return { image: { src: svgMarkupToDataUrl(svg), alt: context.title || "Graphic" } };
  },
};

// ─── image ───────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The image's source string: a file id, a URL or a data URI. */
function imageSource(data: unknown, context?: Pick<PrintBlockContext, "raw">): string {
  const value = data && typeof data === "object" ? (data as { url?: unknown }).url : null;
  return (typeof value === "string" ? value : sourceText(data, context)).trim();
}

/** The image's bytes, through the file funnel — owned, shared and external sources all resolve there. */
export async function imageBlob(source: string): Promise<Blob> {
  if (!source) throw new Error("this image has no source");
  if (source.startsWith("data:")) return (await fetch(source)).blob();
  if (UUID.test(source)) return fileHandler.use({ kind: "file_id", fileId: source }).as({ kind: "blob" });
  if (/^https?:\/\//i.test(source)) return fileHandler.use({ kind: "external_url", url: source }).as({ kind: "blob" });
  throw new Error("this image's source is not one the app can read");
}

async function imageOutput(source: string, title: string | undefined): Promise<PrintBlockOutput> {
  const alt = title || "Image";
  try {
    return { image: { src: await blobToDataUrl(await imageBlob(source)), alt } };
  } catch (error) {
    // A public link still loads in the print window; anything else says why it is missing.
    if (/^https?:\/\//i.test(source)) return { html: svgImageHtml(source, alt) };
    return cannot(alt, error instanceof Error ? error.message : "it could not be read");
  }
}

export const imagePrinter: BlockPrinter = {
  label: "Print image",
  variants: [],
  async print(data) {
    const pending = openPendingPrintWindow("Image");
    pending.write(buildPrintDocument(printBlockOutputHtml(await imageOutput(imageSource(data), undefined)), "Image", "img{max-width:100%;height:auto}"));
  },
  toPrintHtml: (data, context) => lazyOutput(() => imageOutput(imageSource(data, context), context.title)),
};

// ─── chart ───────────────────────────────────────────────────────────────────

const CHART_SIZE = { width: 900, height: 460 } as const;

/** The chart as drawn (title + plot) at a fixed, readable size. */
export async function chartPicture(source: string): Promise<Blob> {
  const [{ parseChartSpec }, { default: ChartCanvas }] = await Promise.all([
    import("@ai-matrx/rich-content/display/blocks/chart/chart-spec"),
    import("@ai-matrx/rich-content/display/blocks/chart/ChartCanvas"),
  ]);
  const spec = parseChartSpec(source);
  if ("error" in spec) throw new Error(spec.error);
  const title = spec.title ? createElement("div", { style: { padding: "12px 16px 0", fontWeight: 600, fontSize: 16 } }, spec.title) : null;
  const plot = createElement("div", { style: { width: CHART_SIZE.width, height: CHART_SIZE.height, padding: 12 } }, createElement(ChartCanvas, { spec }));
  return renderNodePicture(createElement("div", null, title, plot), {
    width: CHART_SIZE.width,
    // Recharts mounts its <svg> first and paints series a frame later.
    ready: (host) => host.querySelectorAll(".recharts-surface").length > 0 && host.querySelectorAll(".recharts-layer path, .recharts-layer rect, .recharts-layer circle").length > 0,
  });
}

export const chartPrinter: BlockPrinter = {
  label: "Print chart",
  variants: [],
  print(data) {
    return printCapturedImage(() => chartPicture(sourceText(data)), "Chart");
  },
  toPrintHtml: (data, context) => lazyOutput(() => pictureOutput(() => chartPicture(sourceText(data, context)), context.title || "Chart")),
};

// ─── diagram ─────────────────────────────────────────────────────────────────

const DIAGRAM_STAGE = { width: 1600, height: 1000 } as const;

/** The whole diagram (every node) drawn off screen, then captured in full. */
export async function diagramPicture(payload: unknown): Promise<Blob> {
  const [{ materializeDiagramDefaults, parseDiagramJSON }, { default: InteractiveDiagramBlock }] = await Promise.all([
    import("@ai-matrx/rich-content/display/blocks/diagram/parseDiagramJSON"),
    import("@ai-matrx/rich-content/display/blocks/diagram/InteractiveDiagramBlock"),
  ]);
  const parsed = typeof payload === "string" ? parseDiagramJSON(payload) : payload;
  if (!parsed) throw new Error("the diagram could not be read");
  const diagram = materializeDiagramDefaults(parsed as Parameters<typeof materializeDiagramDefaults>[0]);
  let last = "";
  return withOffscreen(
    createElement(InteractiveDiagramBlock, { diagram, presentation: "workspace" }),
    {
      width: DIAGRAM_STAGE.width,
      height: DIAGRAM_STAGE.height,
      background: pageBackground(),
      timeoutMs: 20000,
      // Every node painted AND the auto-layout settled (same boxes on consecutive polls).
      ready: (host) => {
        const flow = findFlow(host);
        const boxes = flow ? flowNodeBoxes(flow) : [];
        const signature = boxes.map((b) => `${b.x},${b.y},${b.width},${b.height}`).join("|");
        const settled = boxes.length >= diagram.nodes.length && signature === last;
        last = signature;
        return settled;
      },
    },
    (host) => captureFlowGraph(host),
  );
}

export const diagramPrinter: BlockPrinter = {
  label: "Print diagram",
  variants: [],
  print(data) {
    return printCapturedImage(() => diagramPicture(jsonPayload(data) ?? sourceText(data)), "Diagram");
  },
  toPrintHtml: (data, context) =>
    lazyOutput(() => pictureOutput(() => diagramPicture(jsonPayload(data, context) ?? sourceText(data, context)), context.title || "Diagram")),
};

// ─── presentation ────────────────────────────────────────────────────────────

interface DeckPayload {
  slides: unknown[];
  theme: unknown;
}

function deckOf(payload: unknown): DeckPayload | null {
  const root = payload as { presentation?: { slides?: unknown; theme?: unknown }; slides?: unknown; theme?: unknown } | unknown[] | null;
  if (!root) return null;
  const slides = Array.isArray(root) ? root : (root.presentation?.slides ?? root.slides);
  if (!Array.isArray(slides) || slides.length === 0) return null;
  const theme = Array.isArray(root) ? null : (root.presentation?.theme ?? root.theme ?? null);
  return { slides, theme };
}

const SLIDE_STAGE = { width: 960, height: 540 } as const;
const DEFAULT_DECK_THEME = { primaryColor: "#2563eb", secondaryColor: "#1e40af" };

/** Every slide of the deck as its own picture, in order. */
export async function deckSlidePictures(payload: unknown): Promise<Blob[]> {
  const deck = deckOf(payload);
  if (!deck) throw new Error("the presentation has no slides");
  const [{ SlideView }, { deckFontFamily, resolveDeckTheme }] = await Promise.all([
    import("@/components/mardown-display/blocks/presentations/SlideView"),
    import("@/components/mardown-display/blocks/presentations/presets"),
  ]);
  const theme = resolveDeckTheme((deck.theme ?? DEFAULT_DECK_THEME) as Parameters<typeof resolveDeckTheme>[0]);
  const variant = (theme.variant as "generic" | "fancy" | "deluxe" | undefined) ?? "fancy";
  const slides = deck.slides.map((slide, index) =>
    createElement(
      "div",
      {
        key: index,
        "data-deck-slide": index,
        style: { width: SLIDE_STAGE.width, height: SLIDE_STAGE.height, overflow: "hidden", fontFamily: deckFontFamily(theme.font) },
      },
      createElement(SlideView, { slide: slide as Parameters<typeof SlideView>[0]["slide"], theme, variant, fullScreen: false }),
    ),
  );
  return withOffscreen(
    createElement("div", { style: { display: "flex", flexDirection: "column", gap: 0 } }, slides),
    {
      width: SLIDE_STAGE.width,
      background: "#ffffff",
      ready: (host) => host.querySelectorAll("[data-deck-slide]").length === deck.slides.length && host.scrollHeight >= SLIDE_STAGE.height,
    },
    async (host) => {
      const pictures: Blob[] = [];
      for (const slide of host.querySelectorAll<HTMLElement>("[data-deck-slide]")) {
        pictures.push(await elementPicture(slide, SLIDE_STAGE.width, SLIDE_STAGE.height));
      }
      return pictures;
    },
  );
}

/** The deck's pictures as printable pages, one slide each. */
async function deckHtml(payload: unknown, title: string): Promise<string> {
  const pictures = await deckSlidePictures(payload);
  const pages = await Promise.all(pictures.map((blob) => blobToDataUrl(blob)));
  return pages
    .map(
      (src, index) =>
        `<figure class="matrx-deck-slide" style="margin:0 0 10px;break-after:page;page-break-after:always;break-inside:avoid"><img src="${src}" alt="${escapeHtml(`${title} — slide ${index + 1}`)}" style="display:block;width:100%;height:auto;border:1px solid #cbd5e1"></figure>`,
    )
    .join("");
}

/** All slides stacked into one tall picture (Copy image / Attach screenshot). */
export async function deckStackPicture(payload: unknown): Promise<Blob> {
  const pictures = await deckSlidePictures(payload);
  const images = await Promise.all(
    pictures.map(
      (blob) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("a slide picture could not be read"));
          img.src = URL.createObjectURL(blob);
        }),
    ),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(...images.map((i) => i.naturalWidth));
  canvas.height = images.reduce((sum, i) => sum + i.naturalHeight, 0);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("the browser refused a drawing surface");
  let y = 0;
  for (const img of images) {
    ctx.drawImage(img, 0, y);
    y += img.naturalHeight;
    URL.revokeObjectURL(img.src);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the picture could not be encoded"))), "image/png"));
}

export const presentationPrinter: BlockPrinter = {
  label: "Print slides",
  variants: [],
  async print(data) {
    const pending = openPendingPrintWindow("Presentation");
    try {
      const body = await deckHtml(jsonPayload(data) ?? sourceText(data), "Presentation");
      pending.write(buildPrintDocument(body, "Presentation", "@page{size:landscape;margin:8mm}body{margin:0}"));
    } catch (error) {
      pending.write(buildPrintDocument(printBlockOutputHtml(cannot("Presentation", error instanceof Error ? error.message : "it could not be drawn")), "Presentation"));
      throw error;
    }
  },
  toPrintHtml: (data, context) =>
    lazyOutput(async () => {
      try {
        return { html: await deckHtml(jsonPayload(data, context) ?? sourceText(data, context), context.title || "Presentation") };
      } catch (error) {
        return cannot("Presentation", error instanceof Error ? error.message : "it could not be drawn");
      }
    }),
};

registerBlockPrinter(["svg"], svgPrinter);
registerBlockPrinter(["image"], imagePrinter);
registerBlockPrinter(["chart"], chartPrinter);
registerBlockPrinter(["diagram"], diagramPrinter);
registerBlockPrinter(["presentation"], presentationPrinter);

// ─── the canvas tab: the same adapters, from the tab's own data ──────────────

function tabData(request: CanvasOutputRequest): unknown {
  const stored = readArtifactItemData(request.item.data);
  const data = stored ? contentOf(stored).data : null;
  if (typeof data === "string") {
    const json = parseJson<unknown>(data);
    return json && typeof json === "object" ? json : data;
  }
  return data;
}

async function runPrinter(printer: BlockPrinter, data: unknown): Promise<void> {
  await printer.print(data);
}

type Print = NonNullable<Extract<CanvasKind["print"], (...args: never[]) => unknown>>;
type Capture = NonNullable<Extract<CanvasKind["capture"], (...args: never[]) => unknown>>;

/** A live graph prints/captures from the tab itself, every node; a view with no graph prints as drawn. */
const printLiveGraph: Print = (request) => {
  const element = request.element;
  if (!element) throw new Error("the graph is not on screen");
  if (!findFlow(element)) return void printElement(element, { title: request.title });
  return printCapturedImage(() => captureFlowGraph(element), request.title);
};

const captureLiveGraph: Capture = async (request) => {
  const element = request.element;
  if (!element) throw new Error("the graph is not on screen");
  if (findFlow(element)) return captureFlowGraph(element);
  const { elementToImage } = await import("@ai-matrx/alchemy/operate/capture");
  return elementToImage(element, { safeColors: true });
};

/** diagram + topical map: the full graph, not the visible pane. */
export const GRAPH_OUTPUT = { print: printLiveGraph, capture: captureLiveGraph };

export const SVG_OUTPUT = {
  print: ((request) => runPrinter(svgPrinter, tabData(request))) satisfies Print,
  capture: (async (request) => {
    const svg = extractSvgMarkup(sourceText(tabData(request)));
    if (!svg) throw new Error("this graphic has no drawing");
    return svgMarkupToImage(svg);
  }) satisfies Capture,
};

export const IMAGE_OUTPUT = {
  print: ((request) => runPrinter(imagePrinter, tabData(request))) satisfies Print,
  capture: ((request) => imageBlob(imageSource(tabData(request)))) satisfies Capture,
};

/** The chart prints as drawn (vector); its picture is the same drawing. */
export const CHART_OUTPUT = {
  print: ((request) => {
    const element = request.element;
    if (element) return void printElement(element, { title: request.title });
    return runPrinter(chartPrinter, tabData(request));
  }) satisfies Print,
};

export const PRESENTATION_OUTPUT = {
  print: ((request) => runPrinter(presentationPrinter, tabData(request))) satisfies Print,
  capture: ((request) => deckStackPicture(tabData(request))) satisfies Capture,
};
