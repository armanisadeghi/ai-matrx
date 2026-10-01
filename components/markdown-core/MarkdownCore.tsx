"use client";

// ─────────────────────────────────────────────────────────────────────────
// BUILD-GRAPH FRONT DOOR — the ONE react-markdown edge for the whole app.
//
// Before this existed there were 15 independent react-markdown boundaries
// (each `dynamic(() => import("react-markdown"))` call manufactures its own
// loadable/chunk group per consuming context — see the code-splitting skill,
// rule 3, THE FRAGMENTATION LAW). Every markdown wrapper now renders this
// front door with a named plugin preset; react-markdown, the unified/remark
// graph, and every plugin compile ONCE inside MarkdownCoreImpl.
//
// Never import react-markdown (as a value) or a remark/rehype plugin from a
// component — pick or add a preset instead. `import type` from
// react-markdown remains fine everywhere (erased at compile).
//
// NOT this module's job: the rich-document ENGINE (block registry, code
// surfaces, interactive blocks) — that is MarkdownStream/RichDocument.
// ─────────────────────────────────────────────────────────────────────────

//
// STREAMING: while text is still arriving (`streaming` prop, or a live
// MarkdownStreamingProvider above — the chat engine sets one), the source is
// healed before parse (stream-heal.ts): unclosed emphasis/code/math closed,
// half-arrived links shown as text, half-arrived images never rendered and so
// never fetched. Finished text is never touched.

import dynamic from "next/dynamic";
import type { MarkdownCoreProps } from "./markdown-core-types";
import { healStreamingMarkdown } from "./stream-heal";
import { useMarkdownStreaming } from "./streaming-context";
export type { MarkdownCoreProps, MarkdownPreset } from "./markdown-core-types";

// While the markdown engine's chunk loads (and on the server, where it never
// renders) the slot shows a one-line pulse. It used to render nothing, so a
// deck page painted every card with an empty face until the chunk arrived
// (verify-6 #2, 2026-10-01). A <span>: this sits inside <p>, <button> and
// table cells. A failed load renders nothing here — the route's error
// boundary reports it.
export function MarkdownCoreLoading({ error }: { error?: Error | null }) {
  if (error) return null;
  return (
    <span
      aria-hidden
      data-markdown-loading
      className="inline-block h-[1em] w-2/3 max-w-full animate-pulse rounded bg-muted align-middle"
    />
  );
}

const MarkdownCoreLeaf = dynamic(() => import("./MarkdownCoreImpl"), {
  ssr: false,
  loading: MarkdownCoreLoading,
});

export default function MarkdownCore({
  streaming,
  children,
  ...rest
}: MarkdownCoreProps) {
  const inLiveStream = useMarkdownStreaming();
  const isStreaming = streaming ?? inLiveStream;
  return (
    <MarkdownCoreLeaf {...rest}>
      {isStreaming ? healStreamingMarkdown(children) : children}
    </MarkdownCoreLeaf>
  );
}
