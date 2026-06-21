/**
 * components/mardown-display/blocks/matrx-file/MatrxFileBlock.tsx
 *
 * Renderer for the `matrx_file` block — a line of markdown that contains a link
 * (or bare URL) to one of OUR OWN files. The splitter/accumulator keep the
 * ORIGINAL line on `content`, so this component re-derives everything it needs
 * from the text (works identically for the streaming and DB-reload paths) and
 * renders, in order:
 *
 *     markdown(before the file)  →  inline file preview  →  markdown(after)
 *
 * That "render the surrounding text around the thing we extract" shape is what
 * lets a file link sitting MID-paragraph render gracefully without a separate
 * inline-anchor mechanism — the same way a `flashcards` block turns plain text
 * into a scored deck. The heavy lifting (type discovery, signed-URL re-minting,
 * the previewer per type, the link fallback) lives in `UniversalInlineFile`.
 *
 * If the URL turns out not to be ours after all, the whole block degrades to
 * plain markdown — nothing is ever lost.
 */

"use client";

import React, { useMemo } from "react";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { detectMatrxFileMarkdown } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";
import { UniversalInlineFile } from "./UniversalInlineFile";

interface MatrxFileBlockProps {
  /** The original line (markdown). The source of truth for re-derivation. */
  content?: string;
  /** Splitter fast-path: the recognized URL. */
  src?: string;
  /** Splitter fast-path: the link label. */
  alt?: string;
  /** Splitter fast-path: `{ pre, post, label }`. */
  metadata?: Record<string, unknown>;
}

export function MatrxFileBlock({
  content = "",
  src,
  alt,
  metadata,
}: MatrxFileBlockProps) {
  const parsed = useMemo(() => {
    const detected = detectMatrxFileMarkdown(content);
    const url = detected.url ?? src ?? "";
    const label = detected.label ?? alt ?? "";
    const pre = detected.pre ?? (metadata?.pre as string | undefined) ?? "";
    const post = detected.post ?? (metadata?.post as string | undefined) ?? "";
    return { url, label, pre, post };
  }, [content, src, alt, metadata]);

  const match = useMemo(
    () => (parsed.url ? recognizeOurFileUrl(parsed.url) : null),
    [parsed.url],
  );

  // Not ours after all (or nothing parseable) → degrade to plain markdown.
  if (!match) {
    return <BasicMarkdownContent content={content} />;
  }

  return (
    <div className="matrx-file-block">
      {parsed.pre.trim() ? <BasicMarkdownContent content={parsed.pre} /> : null}
      <UniversalInlineFile
        match={match}
        originalUrl={parsed.url}
        label={parsed.label}
      />
      {parsed.post.trim() ? (
        <BasicMarkdownContent content={parsed.post} />
      ) : null}
    </div>
  );
}

export default MatrxFileBlock;
