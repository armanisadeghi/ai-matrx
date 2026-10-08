"use client";

/**
 * The web host's engines behind the canvas's standard entries (Print, Save as
 * PDF, Copy image): a "dom" tab prints through its type's registered printer
 * when it has one (the same adapter its chat block uses), else as drawn
 * (`printElement`); it captures as drawn (html2canvas). A "frame" HTML page
 * captures through the server engine (record by publication link, L3).
 * "Attach to chat ▸" options are added by the attach lane (`attachOptions`).
 */

import type { CanvasOutputPorts, CanvasOutputRequest } from "@ai-matrx/canvas/react";
import { getBlockPrinter, printElement } from "@ai-matrx/print/core";
import { toast } from "@/lib/toast";
import { copyImage } from "@ai-matrx/kit/clipboard";
import { canvasAttachOptions, canvasHtmlItem } from "./attachOptions";
import { captureRecordOnServer, viewerColorScheme } from "@/features/html-pages/capture/renderedCapture";
import { readArtifactItemData, contentOf } from "@/features/canvas/host/artifactItem";

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
    if (request.surface === "frame") {
      // One lookup for print, capture and attach (the publication link via
      // publishedPage.ts); needs nothing mounted.
      const item = canvasHtmlItem(request);
      if (!item?.saved) return null;
      return async () => {
        const record = await item.resolveRecord();
        if (!record) throw new Error("this page is not published yet");
        const result = await captureRecordOnServer({
          ...record,
          width: element?.clientWidth || 1024,
          colorScheme: viewerColorScheme(),
          includeImage: true,
        });
        if (!result.image) throw new Error("the page capture returned no image");
        return result.image;
      };
    }
    if (!element) return null;
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
