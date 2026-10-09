"use client";

/**
 * THE capture port for rendered output (rendered-output standard, guarantee 2).
 *
 * Frame kinds (an HTML page in a cross-origin frame) are captured by the ONE
 * server engine — scraper-service Chromium via `POST /rendered-output/capture` —
 * at the viewer's ACTUAL frame width and theme, full page. The request names a
 * RECORD (canvas item preferred, else the html page), never a URL.
 *
 * DOM kinds (same-origin DOM bodies) default to client DOM capture
 * (`html-to-image`), the same engine the window tray snapshots use.
 *
 * Canvas: `canvasOutputCapture` is the shape of `CanvasOutputPorts.capture`
 * (`@ai-matrx/canvas` ≥ 0.10). Desktop (matrx-desktop) can serve the same port
 * with `webContents.capturePage`.
 */

import { BackendClient } from "@/lib/api/backend-client";
import { BackendApiError } from "@/lib/api/errors";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { createClient } from "@/utils/supabase/client";

export type RenderedRecordType = "canvas_item" | "html_page";

export interface RenderedRecord {
  recordType: RenderedRecordType;
  recordId: string;
}

export interface ServerCaptureRequest extends RenderedRecord {
  /** The frame width the viewer sees the page at, in CSS px. */
  width: number;
  colorScheme: "light" | "dark";
  /** Also return the PNG bytes (Copy image needs pixels now). */
  includeImage?: boolean;
  /** What the stored image is called — see `screenshotFileName`. */
  fileName?: string;
}

/** The stored screenshot's name: "<page title> screenshot.png" (the chip shows the same). */
export function screenshotFileName(title: string): string {
  const base = title.trim().replace(/[^\w\s.-]+/g, "").trim().slice(0, 60) || "page";
  return `${base} screenshot.png`;
}

export interface ServerCaptureResult {
  fileId: string;
  width: number;
  height: number;
  htmlPageId: string;
  consoleErrors: string[];
  image: Blob | null;
}

const PAGE_ID_RE =
  /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** The html page id inside a published page URL (`…/p/<id>`), or null. */
export function htmlPageIdFromUrl(url: string | null | undefined): string | null {
  return url ? (PAGE_ID_RE.exec(url)?.[1] ?? null) : null;
}

/** The record a rendered HTML surface captures: the canvas item, else its page. */
export function renderedRecordFor(
  canvasItemId: string | null | undefined,
  pageUrl: string | null | undefined,
): RenderedRecord | null {
  if (canvasItemId) return { recordType: "canvas_item", recordId: canvasItemId };
  const pageId = htmlPageIdFromUrl(pageUrl);
  return pageId ? { recordType: "html_page", recordId: pageId } : null;
}

/** The viewer's colour scheme, as the app shell renders it. */
export function viewerColorScheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function base64ToPng(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Wait before the one retry of a capture the server could not serve (a busy browser pool). */
export const CAPTURE_RETRY_BACKOFF_MS = 2_500;

/** A busy or briefly unreachable engine (502/503/504, a dropped connection) is worth ONE retry. */
function isTransientCaptureFailure(error: unknown): boolean {
  if (error instanceof BackendApiError) {
    return error.status === null || error.status === 502 || error.status === 503 || error.status === 504;
  }
  return error instanceof TypeError; // fetch's network failure
}

/** Capture a record on the server engine; the image is stored as a cloud file. */
export async function captureRecordOnServer(
  request: ServerCaptureRequest,
): Promise<ServerCaptureResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to capture.");
  const organizationId = await ensureOrgId(null);
  const client = new BackendClient({
    baseUrl: AIDREAM_PRODUCTION_URL,
    auth: { type: "token", token: session.access_token },
    scope: { organization_id: organizationId ?? undefined },
    // The request model forbids extra fields; the org rides the header.
    sendScopeInBody: false,
  });
  const payload = {
    record_type: request.recordType,
    record_id: request.recordId,
    width: Math.max(240, Math.min(3840, Math.round(request.width))),
    color_scheme: request.colorScheme,
    device_scale_factor:
      typeof window === "undefined"
        ? 1
        : Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    include_image: request.includeImage === true,
    ...(request.fileName ? { file_name: request.fileName } : {}),
  };
  let body: unknown;
  try {
    body = await client.postJson("/rendered-output/capture", payload);
  } catch (error) {
    if (!isTransientCaptureFailure(error)) throw error;
    console.warn("[capture] the capture engine was busy — retrying once", error);
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_RETRY_BACKOFF_MS));
    body = await client.postJson("/rendered-output/capture", payload);
  }
  if (
    !isRecord(body) ||
    typeof body.file_id !== "string" ||
    typeof body.width !== "number" ||
    typeof body.height !== "number"
  ) {
    throw new Error("The capture service answered in a shape this page cannot read.");
  }
  return {
    fileId: body.file_id,
    width: body.width,
    height: body.height,
    htmlPageId: typeof body.html_page_id === "string" ? body.html_page_id : "",
    consoleErrors: Array.isArray(body.console_errors)
      ? body.console_errors.filter((e): e is string => typeof e === "string")
      : [],
    image:
      typeof body.image_base64 === "string" && body.image_base64
        ? base64ToPng(body.image_base64)
        : null,
  };
}

/** Client DOM capture of a same-origin element (the default for DOM kinds). */
export async function captureDomElement(element: HTMLElement): Promise<Blob> {
  const { renderElement, canvasToBlob } = await import("@ai-matrx/alchemy/operate/capture");
  const canvas = await renderElement(element, {
    cacheBust: true,
    pixelRatio: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    width: element.scrollWidth,
    height: element.scrollHeight,
    style: { overflow: "visible", maxHeight: "none", height: `${element.scrollHeight}px` },
  });
  return canvasToBlob(canvas);
}

/**
 * A capture for a frame-kind surface: the server engine at `frame`'s current
 * width and the viewer's theme, returning the PNG.
 */
export function frameCapture(
  record: RenderedRecord,
  frame: () => HTMLElement | null,
): () => Promise<Blob> {
  return async () => {
    const width = frame()?.clientWidth || 1024;
    const result = await captureRecordOnServer({
      ...record,
      width,
      colorScheme: viewerColorScheme(),
      includeImage: true,
    });
    if (!result.image) throw new Error("The capture returned no image.");
    return result.image;
  };
}
