"use client";

/**
 * The picture engine behind the vector / graph / chart / deck artifact types
 * (rendered-output P2 WP1). Three jobs, all browser-side:
 *
 *   - `renderNodePicture`: mount a React tree off screen, wait until it has
 *     drawn, and answer a PNG of it (the message print, where nothing is
 *     mounted).
 *   - `captureFlowGraph`: a picture of a React Flow graph's FULL extent. A live
 *     graph only paints inside its viewport pane, so a DOM copy or print clips
 *     whatever lies off screen; the graph is cloned, its viewport transform
 *     reset to the nodes' bounding box, and that box is drawn.
 *   - `svgMarkupToImage` / `svgMarkupToDataUrl`: an SVG's markup as a picture
 *     (an `<img>` runs no script, loads nothing, and prints as vector).
 */

import { createElement, Suspense, type ReactNode } from "react";
import { Provider } from "react-redux";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getStoreSingleton } from "@/lib/redux/store-singleton";

const MAX_SIDE = 8000;

export interface FlowBounds {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

/** `translate(12px, -4.5px)` (a React Flow node's inline transform) → its offset. */
export function parseTranslate(transform: string | null | undefined): { x: number; y: number } | null {
  const match = /translate(?:3d)?\(\s*(-?[\d.]+)(?:px)?\s*,\s*(-?[\d.]+)(?:px)?/i.exec(transform ?? "");
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

/** The union of node boxes (flow coordinates), or null when there are none. */
export function unionBounds(boxes: readonly { x: number; y: number; width: number; height: number }[]): FlowBounds | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** The graph inside `root` (the root itself when it is one). */
export function findFlow(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  return root.classList.contains("react-flow") ? root : root.querySelector<HTMLElement>(".react-flow");
}

/** Every node's box in flow coordinates, read from the painted nodes. */
export function flowNodeBoxes(flow: HTMLElement): { x: number; y: number; width: number; height: number }[] {
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  for (const node of flow.querySelectorAll<HTMLElement>(".react-flow__node")) {
    const at = parseTranslate(node.style.transform);
    if (!at || !node.offsetWidth || !node.offsetHeight) continue;
    boxes.push({ x: at.x, y: at.y, width: node.offsetWidth, height: node.offsetHeight });
  }
  return boxes;
}

function opaqueBackground(element: HTMLElement): string {
  for (let el: HTMLElement | null = element; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(color)) return color;
  }
  return "#ffffff";
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the picture could not be encoded"))), "image/png"),
  );
}

/**
 * An invisible, fully laid-out place to draw from. NOT off screen by negative offsets: the picture
 * renderer copies the root's computed `left`/`top` into the clone, so a host at -99999px draws
 * blank. The stage sits at 0,0 inside a 0x0 clipping wrapper — never visible, never shifted.
 */
function offscreenStage(css: string): { wrapper: HTMLElement; stage: HTMLElement } {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none;z-index:-1";
  const stage = document.createElement("div");
  stage.style.cssText = `position:relative;${css}`;
  wrapper.appendChild(stage);
  document.body.appendChild(wrapper);
  return { wrapper, stage };
}

const CHROME = ["react-flow__controls", "react-flow__minimap", "react-flow__panel", "react-flow__attribution"];

/** The whole graph (every node, at 1:1) as a PNG — never just the visible pane. */
export async function captureFlowGraph(source: HTMLElement | null, options: { padding?: number } = {}): Promise<Blob> {
  const flow = findFlow(source);
  if (!flow) throw new Error("the graph is not on screen");
  const bounds = unionBounds(flowNodeBoxes(flow));
  if (!bounds) throw new Error("the graph has no nodes to draw yet");
  const pad = options.padding ?? 48;
  const width = Math.ceil(bounds.width + pad * 2);
  const height = Math.ceil(bounds.height + pad * 2);
  const background = opaqueBackground(flow);

  const { wrapper, stage } = offscreenStage(`width:${width}px;height:${height}px;background:${background}`);
  const clone = flow.cloneNode(true) as HTMLElement;
  clone.style.cssText = `width:${width}px;height:${height}px;position:relative;overflow:hidden;background:${background}`;
  const viewport = clone.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("the graph has no drawing surface");
  viewport.style.transform = `translate(${pad - bounds.minX}px, ${pad - bounds.minY}px) scale(1)`;
  stage.appendChild(clone);
  try {
    const ratio = Math.min(2, MAX_SIDE / Math.max(width, height));
    return await elementPicture(stage, background, {
      ratio,
      filter: (node) => !CHROME.some((name) => node.classList?.contains(name)),
    });
  } finally {
    wrapper.remove();
  }
}

export interface OffscreenOptions {
  readonly width: number;
  readonly height?: number | undefined;
  /** True once the tree has drawn everything the picture needs. */
  readonly ready: (host: HTMLElement) => boolean;
  readonly timeoutMs?: number | undefined;
  readonly background?: string | undefined;
}

/** The page's own ground — what a themed tree needs behind it to stay legible. */
export function pageBackground(): string {
  return opaqueBackground(document.body);
}

/** Mounts `node` off screen under the app store, waits (3 steady polls) for `ready`, runs `draw` on it, unmounts. */
export async function withOffscreen<T>(
  node: ReactNode,
  options: OffscreenOptions,
  draw: (host: HTMLElement) => Promise<T>,
): Promise<T> {
  const height = options.height ? `height:${options.height}px;` : "";
  const { wrapper, stage: host } = offscreenStage(`width:${options.width}px;${height}background:${options.background ?? pageBackground()}`);
  host.setAttribute("data-matrx-offscreen-picture", "");
  const store = getStoreSingleton();
  const root = createRoot(host);
  try {
    const boundary = createElement(TooltipProvider, { delayDuration: 200, children: createElement(Suspense, { fallback: null }, node) });
    root.render(store ? createElement(Provider, { store, children: boundary }) : boundary);
    const deadline = Date.now() + (options.timeoutMs ?? 12000);
    let stable = 0;
    while (stable < 3) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      stable = options.ready(host) ? stable + 1 : 0;
      if (Date.now() > deadline) throw new Error("the content did not finish drawing in time");
    }
    return await draw(host);
  } finally {
    root.unmount();
    wrapper.remove();
  }
}

/** `withOffscreen`, drawn as one PNG of the whole host. */
export function renderNodePicture(node: ReactNode, options: OffscreenOptions): Promise<Blob> {
  return withOffscreen(node, options, (host) => elementPicture(host, options.background ?? pageBackground()));
}

/**
 * One element (a slide, a card, a whole host) as a PNG, through Alchemy's html-to-image door
 * (`renderElement`: it keeps the browser's own layout and modern colours — html2canvas cannot
 * parse oklab). Width and height are passed explicitly, and `max-width` is lifted on the root, so
 * a narrow-viewport rule can never clip a wide stage.
 */
export async function elementPicture(
  element: HTMLElement,
  background = "#ffffff",
  options: { ratio?: number; filter?: (node: HTMLElement) => boolean } = {},
): Promise<Blob> {
  const { renderElement } = await import("@ai-matrx/alchemy/operate/capture");
  const canvas = await renderElement(element, {
    pixelRatio: options.ratio ?? 2,
    width: element.offsetWidth,
    height: element.offsetHeight,
    backgroundColor: background,
    style: { maxWidth: "none", maxHeight: "none" },
    ...(options.filter ? { filter: options.filter } : {}),
  });
  return canvasBlob(canvas);
}

// ─── SVG markup ──────────────────────────────────────────────────────────────

const FENCED = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\s*\1\s*$/;

/** The `<svg>…</svg>` inside an artifact body (which may wrap it in a fence); null when there is none. */
export function extractSvgMarkup(raw: string): string | null {
  const fenced = FENCED.exec(raw);
  const body = fenced ? (fenced[2] as string) : raw;
  const start = body.search(/<svg[\s>]/i);
  const end = body.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) return null;
  return body.slice(start, end + 6);
}

/** The markup with an explicit namespace and size, so it loads as an `<img>`. */
export function normalizeSvgMarkup(svg: string): string {
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) return svg;
  let tag = open[0];
  if (!/\sxmlns\s*=/.test(tag)) tag = tag.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  if (viewBox && !/\swidth\s*=/.test(tag) && !/\sheight\s*=/.test(tag)) {
    tag = tag.replace(/<svg\b/i, `<svg width="${viewBox[1]}" height="${viewBox[2]}"`);
  }
  return svg.replace(open[0], tag);
}

export function svgMarkupToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(normalizeSvgMarkup(svg));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the picture could not be loaded"));
    img.src = src;
  });
}

/** The SVG rasterised (white ground, 2x, long side capped) — what Copy image / Attach screenshot need. */
export async function svgMarkupToImage(svg: string): Promise<Blob> {
  const img = await loadImage(svgMarkupToDataUrl(svg));
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 600;
  const ratio = Math.min(2, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("the browser refused a drawing surface");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas);
}
