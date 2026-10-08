"use client";

/**
 * The web host's engines behind the canvas's standard entries (Print, Save as
 * PDF, Copy image): a "dom" tab prints through its type's registered printer
 * when it has one (the same adapter its chat block uses), else as drawn
 * (`printElement`); it captures as drawn (html2canvas). A "frame" HTML page
 * captures through the page capture port once an engine is plugged.
 * "Attach to chat ▸" options are added by the attach lane (`attachOptions`).
 */

import type { CanvasOutputPorts, CanvasOutputRequest } from "@ai-matrx/canvas/react";
import { getBlockPrinter, printElement } from "@ai-matrx/print/core";
import { toast } from "@/lib/toast";
import { copyImage } from "@ai-matrx/kit/clipboard";
import { canvasAttachOptions } from "./attachOptions";
import { readArtifactItemData, contentOf } from "@/features/canvas/host/artifactItem";
import { capturePage, hasPageCaptureEngine } from "./capturePort";
import { publishedPageInElement } from "./publishedPage";

function artifactPrinterFor(request: CanvasOutputRequest) {
  const data = readArtifactItemData(request.item.data);
  if (!data) return null;
  const content = contentOf(data);
  const printer = getBlockPrinter(content.type);
  return printer ? { printer, data: content.data } : null;
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
    if (!element) return null;
    if (request.surface === "frame") {
      const pageUrl = publishedPageInElement(element);
      if (!pageUrl || !hasPageCaptureEngine()) return null;
      return async () => {
        const image = await capturePage({ pageUrl, width: element.clientWidth });
        if (!image) throw new Error("the page capture returned no image");
        return image;
      };
    }
    return async () => {
      const { elementToImage } = await import("@ai-matrx/alchemy/operate/capture");
      return elementToImage(element, { safeColors: true });
    };
  },
  // Through the kit clipboard door, never navigator.clipboard directly.
  copyImage: async (image) => {
    const ok = await copyImage(image);
    if (!ok) throw new Error("the clipboard refused the image");
    toast.success("Image copied");
  },
  // "Attach to chat ▸" — screenshot · code · text (attach lane, L3).
  attachOptions: (request) => canvasAttachOptions(request),
  onError: (message, error) => {
    console.error(`[canvas] ${message}`, error);
    toast.error(`${message}.`);
  },
};
