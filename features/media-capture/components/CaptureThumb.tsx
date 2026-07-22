"use client";

/**
 * features/media-capture/components/CaptureThumb.tsx
 *
 * The capture thumbnail — a one-line leaf over the canonical
 * `<InlineMediaRef>` (which re-mints from `file_id`, so a thumbnail can never
 * rot into an expired signed URL).
 *
 * Why it is its OWN component: `InlineMediaRef` takes its media reference on a
 * prop literally named `ref`. The React Compiler's ref analysis treats every
 * value flowing into a JSX `ref=` attribute as a React ref, and then reports
 * every other read of that value during render as "accessing a ref during
 * render". Isolating the `ref=` hand-off in a leaf that receives ONLY the id
 * keeps that (incorrect) inference from tainting the whole `CloudFile` object
 * in the calling card/row — no eslint-disable required.
 */

import { InlineMediaRef } from "@/features/files";

export interface CaptureThumbProps {
  fileId: string;
  alt: string;
}

export function CaptureThumb({ fileId, alt }: CaptureThumbProps) {
  return <InlineMediaRef ref={fileId} size="fill" alt={alt} fallback="icon" />;
}
