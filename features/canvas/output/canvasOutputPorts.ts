"use client";

/**
 * The web host's engines behind the canvas's standard entries (Print, Save as
 * PDF, Copy image): a "dom" tab prints through its type's registered printer
 * when it has one (the same adapter its chat block uses), else as drawn
 * (`printElement`); it captures as drawn (html2canvas). A "frame" type
 * prints and captures through its own handlers (artifact-output.ts).
 * "Attach to chat ▸" options are added by the attach lane (`attachOptions`).
 */

import type { CanvasOutputPorts, CanvasOutputRequest } from "@ai-matrx/canvas/react";
import { getBlockPrinter, printElement } from "@ai-matrx/print/core";
import { toast } from "@/lib/toast";
import { copyImage } from "@ai-matrx/kit/clipboard";
import { canvasAttachOptions } from "./attachOptions";
import { readArtifactItemData, contentOf } from "@/features/canvas/host/artifactItem";

function parsedData(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * The type's registered printer — only when it recognizes THIS item's data
 * (its message-print form is real content). A shape the printer does not read
 * (a `quiz_set` kind value) prints as drawn instead of "No data to print".
 */
export function artifactPrinterFor(request: Pick<CanvasOutputRequest, "item">) {
  const data = readArtifactItemData(request.item.data);
  if (!data) return null;
  const content = contentOf(data);
  const printer = getBlockPrinter(content.type);
  if (!printer) return null;
  const value = parsedData(content.data);
  const probe = printer.toPrintHtml?.(value, { type: content.type, raw: typeof content.data === "string" ? content.data : "" });
  if (probe instanceof Promise) return { printer, data: value };
  if (!probe || "notice" in probe) return null;
  return { printer, data: value };
}

export const CANVAS_OUTPUT_PORTS: CanvasOutputPorts = {
  print: (request) => {
    const registered = artifactPrinterFor(request);
    if (registered) return () => void registered.printer.print(registered.data);
    const element = request.element;
    if (!element) return null;
    // Synchronous: the print window opens inside the click.
    return () => void printElement(element, { title: request.title });
  },
  capture: (request) => {
    const element = request.element;
    // A frame type captures through its own handler (artifact-output.ts) — never a DOM copy.
    if (request.surface !== "dom") return null;
    if (!element) return null;
    return async () => {
      // A large tab takes seconds: say so at once (Copy image has no chip of its own).
      const progress = toast.loading("Capturing…");
      try {
        const { elementToImage } = await import("@ai-matrx/alchemy/operate/capture");
        return await elementToImage(element, { safeColors: true });
      } finally {
        toast.dismiss(progress);
      }
    };
  },
  // Through the kit clipboard door, never navigator.clipboard directly.
  copyImage: async (image) => {
    const ok = await copyImage(image);
    if (!ok) throw new Error("the clipboard refused the image");
    toast.success("Image copied");
  },
  // "Attach to chat ▸" — screenshot · code · text (attach lane, L3).
  // `capture` is the canvas's own resolution (kind capture, then this port) — the one Copy image uses.
  attachOptions: (request, capture) => canvasAttachOptions(request, capture),
  onError: (message, error) => {
    console.error(`[canvas] ${message}`, error);
    toast.error(`${message}.`);
  },
};
