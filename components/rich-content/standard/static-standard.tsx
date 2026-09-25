// ─────────────────────────────────────────────────────────────────────────
// The `standard` level's block routing for STATICALLY rendered roots — the
// server level (RichContentServer) and the SSR'd client leaf
// (RichContentStaticStandard, share pages / public resources). ONE routing
// for both, so a ```markdown fence with its own inner fences, an <info>
// section or a divider splits exactly as it does in the app: the same
// splitter core (content-splitter-core, THE nested-fence rule from
// @ai-matrx/content-ir/source) and the same client StandardBlock for
// engine-backed blocks. Only the prose leaf differs by environment, and it is
// injected (`Prose`): ProseServer on the server, StaticProseLeaf on the
// client — both render the one prose map and frame.
//
// Environment-neutral: no "use client", no hooks.
// Guard: __tests__/server-level-parity.test.tsx (nested-fence share case).
// ─────────────────────────────────────────────────────────────────────────

import type { ComponentType, ReactNode } from "react";
import {
  NO_SPLITTER_ENVELOPES,
  splitContentIntoBlocksWith,
  type SplitterBlock,
} from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-core";
import { RichContentDepthProvider } from "../depth";
import { fenceNestsInnerFences } from "@ai-matrx/content-ir/source";
import MarkdownPreviewBlock from "@/components/mardown-display/blocks/markdown-preview/MarkdownPreviewBlock";
import { StandardBlock } from "./StandardBlocks";
import XmlBlock from "@/components/mardown-display/blocks/xml/XmlBlock";
import { tokenizeXml } from "@/components/mardown-display/blocks/xml/xml-tokenize";
import {
  computeDocumentNumbering,
  type DocumentNumbering,
} from "@/components/markdown-core/syntax/document-numbering";
import { DocumentNumberingProvider } from "@/components/markdown-core/syntax/elements/DocumentNumbering";

/** The injected prose leaf. `numbering` is the WHOLE document's (one pass at the root). */
export type StaticProse = ComponentType<{
  content: string;
  numbering?: DocumentNumbering | null;
}>;

/** XML control sections whose body is prose — the same set StandardBlock nests. */
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

/** The same set StandardBlock routes to XmlBlock. */
const XML_LANGUAGES = new Set(["xml", "svg"]);

const MUTED_SECTIONS = new Set([
  "thinking",
  "reasoning",
  "consolidated_reasoning",
]);

function StaticBlock({
  block,
  depth,
  cap,
  Prose,
  numbering,
}: {
  block: SplitterBlock;
  depth: number;
  cap: number;
  Prose: StaticProse;
  numbering: DocumentNumbering;
}) {
  const { type, content } = block;

  if (type === "text" || type === "table") {
    if (!content.trim()) return null;
    return <Prose content={content} numbering={numbering} />;
  }

  if (SECTION_TYPES.has(type) && depth + 1 <= cap) {
    if (!content.trim()) return null;
    return (
      <div
        data-rich-content-section={type}
        className={
          MUTED_SECTIONS.has(type)
            ? "my-2 border-l-2 border-border pl-3 text-muted-foreground"
            : "my-2"
        }
      >
        <StaticStandard source={content} depth={depth + 1} cap={cap} Prose={Prose} numbering={numbering} />
      </div>
    );
  }

  // A ```markdown / ```md / ```mdx fence: the same card the app draws, with
  // its document rendered HERE (one level deeper, same routing) so the
  // nested prose is in the server HTML. Past the cap it falls through to the
  // client card, whose capped view matches the app's.
  if (
    type === "code" &&
    fenceNestsInnerFences(block.language?.toLowerCase()) &&
    depth + 1 <= cap
  ) {
    return (
      <RichContentDepthProvider depth={depth} cap={cap}>
        <MarkdownPreviewBlock
          content={content}
          renderedPreview={
            <StaticStandard source={content} depth={depth + 1} cap={cap} Prose={Prose} numbering={numbering} />
          }
        />
      </RichContentDepthProvider>
    );
  }

  // An XML / SVG card (generic tags like <math>, <iframe>, <custom-note>):
  // the same card the app draws, with its prose segments rendered HERE so
  // the text between the tags is in the server HTML. Tokenized by the one
  // tokenizer XmlBlock uses (xml-tokenize.ts), keyed by token index. The
  // prose goes through the same core — raw tags inside stay inert text.
  const xmlLanguage =
    type === "svg" ? "svg" : type === "code" ? block.language?.toLowerCase() : undefined;
  if (xmlLanguage && XML_LANGUAGES.has(xmlLanguage) && depth + 1 <= cap) {
    const renderedProse: Record<number, ReactNode> = {};
    tokenizeXml(content).forEach((token, idx) => {
      if (token.type === "markdown" && token.text?.trim()) {
        renderedProse[idx] = (
          <StaticStandard
            source={token.text}
            depth={depth + 1}
            cap={cap}
            Prose={Prose}
            numbering={numbering}
          />
        );
      }
    });
    return (
      <RichContentDepthProvider depth={depth} cap={cap}>
        <XmlBlock content={content} language={xmlLanguage} renderedProse={renderedProse} />
      </RichContentDepthProvider>
    );
  }

  if (type === "image" && block.src) {
    return (
      <img
        src={block.src}
        alt={block.alt || ""}
        className="my-2 h-auto max-w-full rounded-md object-contain"
      />
    );
  }

  if (type === "accent-divider" || type === "heavy-divider") {
    return <hr className="my-4 border-border" />;
  }

  // Interactive or engine-backed blocks: the client StandardBlock, told how
  // deep it sits so its own nesting (and the capped "Render it" view past
  // the cap) behaves exactly as it does on the client. Only the fields it
  // reads cross the wire.
  return (
    <RichContentDepthProvider depth={depth} cap={cap}>
      <StandardBlock
        block={{
          type,
          content,
          language: block.language,
          src: block.src,
          alt: block.alt,
        }}
      />
    </RichContentDepthProvider>
  );
}

export function StaticStandard({
  source,
  depth,
  cap,
  className,
  Prose,
  numbering,
}: {
  source: string;
  depth: number;
  cap: number;
  className?: string;
  Prose: StaticProse;
  /** Set by the root; nested documents keep the root's numbers. */
  numbering?: DocumentNumbering;
}) {
  // The same splitter as the client levels, minus the kind-envelope hooks
  // (metadata only — block types and boundaries are identical).
  const blocks = splitContentIntoBlocksWith(source, NO_SPLITTER_ENVELOPES);
  // The ROOT computes the document-wide numbering once (figures, tables,
  // equations number across blocks). Every standard root carries
  // `data-matrx-doc-root`, exactly as the client StandardBlocks does —
  // find-in-document and the TOC look for it on server pages too.
  const isRoot = numbering === undefined;
  const docNumbering = numbering ?? computeDocumentNumbering(source);
  const body = (
    <div
      data-rich-content="standard"
      data-matrx-doc-root=""
      className={className ?? "min-w-0"}
    >
      {blocks.map((block, index) => (
        <StaticBlock
          key={index}
          block={block}
          depth={depth}
          cap={cap}
          Prose={Prose}
          numbering={docNumbering}
        />
      ))}
    </div>
  );
  // Client blocks beneath (code cards, capped sections) read the same
  // numbering from the one provider.
  return isRoot ? (
    <DocumentNumberingProvider source={source}>{body}</DocumentNumberingProvider>
  ) : (
    body
  );
}
