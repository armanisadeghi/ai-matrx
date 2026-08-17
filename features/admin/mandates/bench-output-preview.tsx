"use client";

/**
 * ONE renderer for a bench run's output — shared by the batch result rows and
 * the ad-hoc "Try it now" panel. It exists as its own module because both
 * consumers need it and a second, poorer copy is exactly how a media result
 * ends up rendered as a raw expiring URL: an image-producing mandate's output IS
 * a file URL, so it is resolved back to its `file_id` and rendered through
 * `InlineMediaRef`, never as text. Long text is capped so a 200KB run cannot
 * be dumped into the DOM.
 */

import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";

const MAX_PREVIEW_CHARS = 3200;

export function OutputPreview({
  output,
  artifact,
}: {
  output: string;
  artifact: unknown;
}) {
  const fileId = output ? fileIdFromUserFilesUrl(output.trim()) : null;
  if (fileId) {
    return <InlineMediaRef ref={fileId} size="xl" fit="cover" />;
  }
  const text = artifact != null ? JSON.stringify(artifact, null, 1) : output;
  return (
    <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 text-[11px]">
      {text
        ? text.length > MAX_PREVIEW_CHARS
          ? `${text.slice(0, MAX_PREVIEW_CHARS)}…`
          : text
        : "(empty)"}
    </pre>
  );
}
