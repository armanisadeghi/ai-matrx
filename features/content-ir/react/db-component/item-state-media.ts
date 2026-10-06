"use client";

/**
 * Images saved onto an item (`run_shortcut` with `expect: "image"`) are stored
 * by durable identity only — `{ file_id, mime_type, width, height }`. A file id
 * is not something a component can put in `<img src>`: the sandbox frame has an
 * opaque origin, `connect-src 'none'`, and no reliable cookie (third-party), so
 * the HOST fetches the bytes with the person's own authorization (the python
 * client's bearer lane, `downloadFile`) and hands them over:
 *
 *  - in-page render → `src` is a `blob:` URL created here;
 *  - sandbox frame  → `src` is the Blob itself (structured-clone over the
 *    port); the frame turns it into its own `blob:` URL (frame-bridge).
 *
 * A component therefore always renders `itemState.<key>.src` and never knows
 * which world it is in. A ref whose bytes failed to load carries `src: null`
 * and `src_error` with a sentence the component can show.
 */

import { useEffect, useState } from "react";
import { downloadFile } from "@/features/files/api/files";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

type State = Record<string, unknown>;

/** How deep a saved value may nest an image ref (`idea_3.image`, `images[0]`). */
const MAX_DEPTH = 3;

function isImageRef(value: unknown): value is { file_id: string; mime_type?: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  if (typeof ref.file_id !== "string" || !ref.file_id) return false;
  return typeof ref.mime_type !== "string" || ref.mime_type.startsWith("image/");
}

/** Every image file id a state holds, in a stable order. */
export function imageFileIdsOf(state: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > MAX_DEPTH || !state || typeof state !== "object") return out;
  if (isImageRef(state)) {
    if (!out.includes(state.file_id)) out.push(state.file_id);
    return out;
  }
  for (const value of Array.isArray(state) ? state : Object.values(state)) {
    imageFileIdsOf(value, depth + 1, out);
  }
  return out;
}

export type ImageSources = ReadonlyMap<string, { blob: Blob } | { error: string }>;

/** Returns `state` with every image ref given `src` (and `src_error` when it failed). */
export function withImageSources(
  state: State | null,
  sources: ImageSources,
  mode: "url" | "blob",
  depth = 0,
): State | null {
  if (!state) return state;
  const walk = (value: unknown, d: number): unknown => {
    if (d > MAX_DEPTH || !value || typeof value !== "object") return value;
    if (isImageRef(value)) {
      const source = sources.get(value.file_id);
      if (!source) return { ...value, src: null };
      if ("error" in source) return { ...value, src: null, src_error: source.error };
      return { ...value, src: mode === "blob" ? source.blob : objectUrlFor(source.blob) };
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, d + 1));
    const out: State = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, d + 1);
    return out;
  };
  return walk(state, depth) as State;
}

// One object URL per Blob for the page's lifetime (blobs are cached per file id,
// so this is bounded by the images a person actually saw).
const objectUrls = new WeakMap<Blob, string>();
function objectUrlFor(blob: Blob): string {
  let url = objectUrls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    objectUrls.set(blob, url);
  }
  return url;
}

const cache = new Map<string, Promise<{ blob: Blob } | { error: string }>>();

function loadImage(fileId: string): Promise<{ blob: Blob } | { error: string }> {
  let pending = cache.get(fileId);
  if (!pending) {
    pending = downloadFile(fileId, { inline: true })
      .then(({ blob }) => ({ blob }))
      .catch((err: unknown) => {
        cache.delete(fileId);
        captureError({
          source: "content-ir",
          message: `[kind-item-state] could not load saved image ${fileId}`,
          raw: { fileId, error: err instanceof Error ? err.message : String(err) },
        });
        return { error: "This image couldn't be loaded." };
      });
    cache.set(fileId, pending);
  }
  return pending;
}

/** The loaded bytes for every image ref in `state`. */
export function useItemStateImages(state: State | null): ImageSources {
  const ids = imageFileIdsOf(state);
  const key = ids.join("|");
  const [sources, setSources] = useState<Map<string, { blob: Blob } | { error: string }>>(
    () => new Map(),
  );
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    for (const id of key.split("|")) {
      void loadImage(id).then((source) => {
        if (!live) return;
        setSources((prev) => {
          if (prev.get(id) === source) return prev;
          const next = new Map(prev);
          next.set(id, source);
          return next;
        });
      });
    }
    return () => {
      live = false;
    };
  }, [key]);
  return sources;
}
