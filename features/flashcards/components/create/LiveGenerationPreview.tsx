"use client";

/**
 * Live card-by-card preview while the generateCards agent streams —
 * The preview goes through the SAME MarkdownStream entry point as a normal
 * assistant message. The canonical envelope still comes from the parent's
 * Redux subscription for persistence, but rendering is owned entirely by the
 * shared rich-document pipeline — never a second bespoke block renderer.
 *
 * Every card mounts the moment its `front` arrives, back showing the
 * per-card loader until it streams in — no "spinner until everything is
 * done" experience.
 */

import MarkdownStream from "@/components/MarkdownStream";

export function LiveGenerationPreview({
  requestId,
}: {
  requestId: string | null;
}) {
  if (!requestId) return null;

  return (
    <div data-message-content>
      <MarkdownStream imagePolicy="ai"
        requestId={requestId}
        isStreamActive
        hideCopyButton
        allowFullScreenEditor={false}
      />
    </div>
  );
}
