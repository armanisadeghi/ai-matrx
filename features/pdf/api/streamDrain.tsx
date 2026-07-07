"use client";

/**
 * features/pdf/api/streamDrain.tsx — shared NDJSON drain for the streaming
 * /utilities/pdf/* analyzers (2026-07 stream-everything conversion).
 *
 * The five layout-analysis endpoints (extract-tables, classify-pages,
 * extract-reading-order, detect/strip-repeated-regions) no longer return
 * blocking JSON — they stream `{event, data}` NDJSON lines where the
 * TERMINAL data event carries the old response body. This helper drains
 * the stream via the canonical `postNdjson` (lib/python-client.ts):
 *   - intermediate data events go to `onProgress` (live counters),
 *   - the event whose `data.type === terminalType` is returned,
 *   - in-stream `event: "error"` lines throw a readable Error
 *     (pre-stream HTTP failures already throw from postNdjson).
 *
 * `<PdfStreamProgress>` is the matching one-line live progress display
 * used by the demo pages.
 */

import { Loader2 } from "lucide-react";

import { postNdjson } from "@/lib/python-client";
import type {
  TypedDataPayload,
  UntypedDataPayload,
} from "@/types/python-generated/stream-events";

/** Any `event: "data"` payload from the stream (typed or fallback). */
export type PdfStreamData = TypedDataPayload | UntypedDataPayload;

export interface DrainPdfStreamOptions {
  /** Called for every non-terminal data event — drive a progress line. */
  onProgress?: (data: PdfStreamData) => void;
  signal?: AbortSignal;
}

/**
 * POST `body` to a streaming PDF endpoint and drain the NDJSON stream,
 * resolving with the terminal payload (the old blocking-JSON response).
 * Throws on in-stream `error` events and on a stream that ends without
 * the terminal event.
 */
export async function drainPdfStream<T extends PdfStreamData>(
  path: string,
  body: unknown,
  terminalType: NonNullable<T["type"]>,
  opts: DrainPdfStreamOptions = {},
): Promise<T> {
  let terminal: T | null = null;
  for await (const evt of postNdjson(path, body, { signal: opts.signal })) {
    if (evt.event === "error") {
      throw new Error(
        evt.data.user_message ?? evt.data.message ?? `${path} stream failed`,
      );
    }
    if (evt.event !== "data") continue;
    const d = evt.data;
    if (!d || typeof d !== "object" || typeof d.type !== "string") continue;
    if (d.type === terminalType) {
      // The generated data union includes UntypedDataPayload (indexed), so
      // literal narrowing alone can't pin the member — assert after
      // checking the discriminant (same pattern as AnalysisTab).
      terminal = d as T;
    } else {
      opts.onProgress?.(d);
    }
  }
  if (!terminal) {
    throw new Error(
      `${path}: stream ended without a terminal "${terminalType}" event`,
    );
  }
  return terminal;
}

/** Compact live progress line shown while a PDF stream is draining. */
export function PdfStreamProgress({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
      <span className="truncate">{text}</span>
    </div>
  );
}
