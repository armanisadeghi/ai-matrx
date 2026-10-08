"use client";

/**
 * Plugs the server capture engine (scraper Chromium, `POST /rendered-output/capture`)
 * into THE page capture port (`features/canvas/output/capturePort.ts`), so the
 * canvas tab's Copy image, a message's Print and Full Print's frame pre-pass all
 * get an exact image of a published page at the viewer's width and theme.
 */

import { setPageCaptureEngine } from "@/features/canvas/output/capturePort";
import {
  captureRecordOnServer,
  htmlPageIdFromUrl,
  viewerColorScheme,
} from "./renderedCapture";

setPageCaptureEngine(async ({ pageUrl, width }) => {
  const pageId = htmlPageIdFromUrl(pageUrl);
  // A page never published has no record to capture — the caller says so.
  if (!pageId) return null;
  const result = await captureRecordOnServer({
    recordType: "html_page",
    recordId: pageId,
    width: width || 1024,
    colorScheme: viewerColorScheme(),
    includeImage: true,
  });
  return result.image;
});
