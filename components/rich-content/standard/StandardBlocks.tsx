"use client";

// ─────────────────────────────────────────────────────────────────────────
// The `standard` level of <RichContent>: prose + code + tables + mermaid +
// XML sections + ```markdown fences — NO kinds, NO actions.
//
// Same core as `full`: the SAME block splitter (content-splitter-v2, with the
// shared nested-fence rule), the SAME prose leaf (BasicMarkdownContent →
// MarkdownCore preset "chat"), the SAME block components (XmlBlock,
// MarkdownPreviewBlock, CodeBlock, MermaidBlock). What it leaves out is the
// kind registry / interactive-block routing, so a structured payload shows as
// its JSON source here — the `full` level is where kinds render.
//
// Nested content (an <info> body, a ```markdown fence's document, an XML
// section's prose) goes through `NestedRichContent`, which renders one level
// deeper and stops at the depth cap. Streaming-safe: a partial trailing tag
// or half-typed fence marker is healed before splitting, and an unclosed
// inner fence renders as a streaming code block — never as raw markup.
//
// Statically imported by the full engine (block-dispatch, XmlBlock,
// MarkdownPreviewBlock) — inside that graph it adds no loading boundary. For
// callers outside the engine, <RichContent level="standard"> reaches it
// through ONE dynamic edge (RichContentStandardImpl).
// ─────────────────────────────────────────────────────────────────────────

import { Suspense, lazy } from "react";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import type { SplitterBlock } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { InlineCodeSnippet } from "@/components/mardown-display/chat-markdown/InlineCodeSnippet";
import XmlBlock from "@/components/mardown-display/blocks/xml/XmlBlock";
import MarkdownPreviewBlock from "@/components/mardown-display/blocks/markdown-preview/MarkdownPreviewBlock";
import { FENCE_META_KEY } from "@/components/markdown-core/fence-meta";
// Static (not lazy): a CSV table must be in the server HTML of a share page too.
import CsvBlock from "@/components/mardown-display/blocks/csv/CsvBlock";
import { fenceNestsInnerFences } from "@ai-matrx/content-ir/source";
import { NestedRichContent } from "./NestedRichContent";
import { DocumentNumberingProvider } from "@/components/markdown-core/syntax/elements/DocumentNumbering";
import { healStreamingTail } from "./stream-holdback";
import {
  MarkdownStreamingProvider,
  useMarkdownStreaming,
} from "@/components/markdown-core/streaming-context";
import { RemoteImageGate } from "@/components/rich-content/prose/remote-image-policy";

// Heavy engines stay behind React.lazy (an async edge inside the parent's
// existing chunk graph — no new loadable; code-splitting rule 3), exactly as
// the full engine's BlockComponentRegistry tiers them.
const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);
const MermaidBlock = lazy(
  () => import("@/components/mardown-display/blocks/mermaid/MermaidBlock"),
);

/** XML control sections whose body is prose that may carry nested blocks. */
const SECTION_TYPES = new Set([
  "info",
  "task",
  "plan",
  "database",
  "private",
  "event",
  "tool",
  "thinking",
  "reasoning",
  "consolidated_reasoning",
]);

const XML_LANGUAGES = new Set(["xml", "svg"]);

/** The fallback for a code block while its highlighter chunk loads. */
function PlainCode({ code }: { code: string }) {
  return (
    <pre className="my-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">
      {code}
    </pre>
  );
}

function CodeFence({
  code,
  language,
  isStreaming,
  meta,
}: {
  code: string;
  language?: string;
  isStreaming?: boolean;
  /** The fence info string after the language (title="…", {2,4}) — fence-meta.ts. */
  meta?: string;
}) {
  const probe = code.trim();
  if (!probe) return null;
  // A fence that carries a title or highlighted lines always gets the full
  // code block — the compact snippet has nowhere to draw either.
  if (!meta && probe.split("\n").length <= 2 && probe.length < 120) {
    return (
      <InlineCodeSnippet code={code} language={language} className="my-3" />
    );
  }
  return (
    <Suspense fallback={<PlainCode code={code} />}>
      <CodeBlock
        code={code}
        language={language || "text"}
        meta={meta}
        fontSize={14}
        className="my-3"
        isStreamActive={isStreaming}
      />
    </Suspense>
  );
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  );
}

export function StandardBlock({
  block,
  isStreaming,
}: {
  block: SplitterBlock;
  isStreaming?: boolean;
}) {
  const { type, content } = block;

  if (type === "text" || type === "table") {
    if (!content.trim()) return null;
    return (
      <BasicMarkdownContent
        content={content}
        isStreamActive={isStreaming}
        showCopyButton={false}
      />
    );
  }

  if (SECTION_TYPES.has(type)) {
    if (!content.trim()) return null;
    const muted =
      type === "thinking" ||
      type === "reasoning" ||
      type === "consolidated_reasoning";
    return (
      <div
        data-rich-content-section={type}
        className={
          muted
            ? "my-2 border-l-2 border-border pl-3 text-muted-foreground"
            : "my-2"
        }
      >
        <NestedRichContent source={content} isStreaming={isStreaming} />
      </div>
    );
  }

  if (type === "code") {
    const language = block.language?.toLowerCase();
    if (fenceNestsInnerFences(language)) {
      return (
        <MarkdownPreviewBlock content={content} isStreamActive={isStreaming} />
      );
    }
    if (language && XML_LANGUAGES.has(language)) {
      return <XmlBlock content={content} language={language} />;
    }
    // ```csv / ```tsv — the same sortable table the full engine renders.
    if (language === "csv" || language === "tsv") {
      return (
        <CsvBlock content={content} delimiter={language === "tsv" ? "\t" : ","} className="my-3" />
      );
    }
    const fenceMeta = block.metadata?.[FENCE_META_KEY];
    return (
      <CodeFence
        code={content}
        language={language}
        isStreaming={isStreaming}
        meta={typeof fenceMeta === "string" && fenceMeta ? fenceMeta : undefined}
      />
    );
  }

  if (type === "mermaid") {
    return (
      <Suspense fallback={<PlainCode code={content} />}>
        <MermaidBlock content={content} isStreamActive={isStreaming} />
      </Suspense>
    );
  }

  if (type === "svg") {
    return <XmlBlock content={content} language="svg" />;
  }

  if (type === "image" && block.src) {
    return (
      <RemoteImageGate src={block.src} alt={block.alt} block>
        <img
          src={block.src}
          alt={block.alt || ""}
          referrerPolicy="no-referrer"
          className="my-2 h-auto max-w-full rounded-md object-contain"
        />
      </RemoteImageGate>
    );
  }

  if (type === "accent-divider" || type === "heavy-divider") {
    return <hr className="my-4 border-border" />;
  }

  // Everything else — structured kinds, promoted fences (html, react, diff,
  // chart…), media, artifacts — is shown as its source at this level. The
  // `full` level is where those render as components.
  if (!content.trim()) return null;
  if (looksLikeJson(content)) {
    return <CodeFence code={content} language="json" isStreaming={isStreaming} />;
  }
  return (
    <CodeFence
      code={content}
      language={block.language ?? type}
      isStreaming={isStreaming}
    />
  );
}

export interface StandardBlocksProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
}

/** Split once, render each block at the standard level. */
export function StandardBlocks({
  source,
  isStreaming,
  className,
}: StandardBlocksProps) {
  // A live stream either announced by the caller or inherited from the chat
  // engine above: the tail is held back (stream-holdback.ts) and every
  // MarkdownCore leaf below heals half-arrived inline syntax (stream-heal.ts).
  const live = useMarkdownStreaming() || !!isStreaming;
  const blocks = splitContentIntoBlocksV2(
    live ? healStreamingTail(source) : source,
  );
  return (
    <MarkdownStreamingProvider value={live}>
      {/* One numbering for the whole document, however many blocks it splits into. */}
      <DocumentNumberingProvider source={source}>
        <div data-rich-content="standard" data-matrx-doc-root="" className={className ?? "min-w-0"}>
          {blocks.map((block, index) => (
            <StandardBlock
              key={index}
              block={block}
              isStreaming={live && index === blocks.length - 1}
            />
          ))}
        </div>
      </DocumentNumberingProvider>
    </MarkdownStreamingProvider>
  );
}

export default StandardBlocks;
