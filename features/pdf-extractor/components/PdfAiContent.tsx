"use client";

import MarkdownStream from "@/components/MarkdownStream";

/**
 * PdfAiContent — the ONE canonical renderer for AI-GENERATED PDF content.
 *
 * Whole-document AI clean output and full-pipeline template output — whether
 * live-streaming or final — render through here. It routes to `MarkdownStream`,
 * the platform's rich-document engine (the same one that renders assistant
 * chat messages), so:
 *   - markdown renders as markdown (headings, tables, lists…), not a raw dump;
 *   - the model's chain-of-thought (`<thinking>` / `<reasoning>`) shows as a
 *     collapsed `ThinkingTrace`, consistently — never leaked as literal text.
 *
 * This replaces the raw `<pre className="font-mono">` blocks that displayed AI
 * output verbatim (the "thinking spilled into the UI" / broken-markdown bug).
 *
 * Do NOT use this for the RAW EXTRACTED PDF text — that is not AI output and is
 * legitimately monospace; keep those `<pre>` blocks as-is.
 */
export function PdfAiContent({
  content,
  isStreaming = false,
  className,
}: {
  content: string;
  /** True while the clean/pipeline stream is still in flight. */
  isStreaming?: boolean;
  className?: string;
}) {
  return (
    <MarkdownStream
      content={content}
      isStreamActive={isStreaming}
      hideCopyButton
      allowFullScreenEditor={false}
      className={className}
    />
  );
}
