"use client";

import React from "react";
import { LinkComponent } from "@/components/mardown-display/blocks/links/LinkComponent";
import { applyInlineMarkdownHtmlFormatting } from "@/components/mardown-display/blocks/links/applyInlineMarkdownHtmlFormatting";

const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

interface InlineMarkdownWithLinksProps {
  text: string;
  className?: string;
}

/**
 * Renders lightweight inline markdown (bold, italic, `[text](url)` links)
 * for table cells and other non–react-markdown surfaces. Links route through
 * `LinkComponent` so the delayed hover menu is consistent with chat markdown.
 */
export function InlineMarkdownWithLinks({
  text,
  className,
}: InlineMarkdownWithLinksProps) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  LINK_REGEX.lastIndex = 0;
  while ((match = LINK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.substring(lastIndex, match.index);
      nodes.push(
        <span
          key={`t-${key++}`}
          dangerouslySetInnerHTML={{
            __html: applyInlineMarkdownHtmlFormatting(chunk),
          }}
        />,
      );
    }
    nodes.push(
      <LinkComponent key={`l-${key++}`} href={match[2]}>
        {match[1]}
      </LinkComponent>,
    );
    lastIndex = LINK_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    const chunk = text.substring(lastIndex);
    nodes.push(
      <span
        key={`t-${key++}`}
        dangerouslySetInnerHTML={{
          __html: applyInlineMarkdownHtmlFormatting(chunk),
        }}
      />,
    );
  }

  if (nodes.length === 0) {
    if (!text) return null;
    return (
      <span
        className={className}
        dangerouslySetInnerHTML={{
          __html: applyInlineMarkdownHtmlFormatting(text),
        }}
      />
    );
  }

  return <span className={className}>{nodes}</span>;
}
