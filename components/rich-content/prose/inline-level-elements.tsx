// ─────────────────────────────────────────────────────────────────────────
// The `inline` level's element map — every block element as phrasing content.
//
// Environment-neutral (no "use client"): the client inline level
// (RichContentInline) and the server level (server/RichContentServer) spread
// THIS map, so an inline construct renders byte-for-byte the same on either
// side. The client pieces it names (LinkComponent, Checkbox, variable and
// citation chips) carry their own "use client" boundaries.
// ─────────────────────────────────────────────────────────────────────────

import type { MarkdownComponents as Components } from "@/components/markdown-core/markdown-core-types";
import { cn } from "@/lib/utils";
import { isHeadingAnchorProps } from "@/components/markdown-core/heading-anchors-props";
import { THICK_HR_SENTINEL } from "./prose-prepare";
import { PROSE_INLINE_ELEMENTS } from "./prose-inline-elements";
import { INLINE_SYNTAX_ELEMENTS } from "@/components/markdown-core/syntax/elements/core-syntax-elements";

/** Paragraph-level spans; a second one in a row starts on its own line. */
export const INLINE_P_CLASS = "rc-inline-p";

/**
 * Block elements as phrasing content. Paragraph-like spans carry
 * `data-rc-block` so the wrapper can put consecutive ones on their own lines
 * while a single paragraph flows inline (titles, clamped rows, `truncate`).
 */
const InlineLink = PROSE_INLINE_ELEMENTS.a as NonNullable<Components["a"]>;

export const INLINE_LEVEL_ELEMENTS = {
  ...PROSE_INLINE_ELEMENTS,
  // The extended syntax's block constructs (callouts, tabs, figures…) as spans.
  ...INLINE_SYNTAX_ELEMENTS,
  // The inline level renders no sections, so a heading's hover anchor would
  // link to nothing and read as part of the title: never rendered here.
  a: (props) => (isHeadingAnchorProps(props) ? null : <InlineLink {...props} />),
  p: ({ children }) => {
    const only = Array.isArray(children) ? null : children;
    if (only === " ") return <span data-rc-block className="block h-[0.4em]" />;
    if (only === THICK_HR_SENTINEL)
      return (
        <span
          data-rc-block
          role="separator"
          className="my-1.5 block h-[3px] rounded-full bg-blue-500 dark:bg-blue-400"
        />
      );
    return (
      <span data-rc-block className={INLINE_P_CLASS}>
        {children}
      </span>
    );
  },
  h1: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h2: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h3: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h4: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h5: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  h6: ({ children }) => (
    <span data-rc-block className="font-semibold">
      {children}
    </span>
  ),
  ul: ({ children }) => (
    <span data-rc-block className="block list-inside list-disc">
      {children}
    </span>
  ),
  ol: ({ children }) => (
    <span data-rc-block className="block list-inside list-decimal">
      {children}
    </span>
  ),
  li: ({ children }) => <span className="list-item">{children}</span>,
  blockquote: ({ children }) => (
    <span
      data-rc-block
      className="block border-l-2 border-border pl-2 italic text-muted-foreground"
    >
      {children}
    </span>
  ),
  pre: ({ children }) => (
    <span
      data-rc-block
      className="block overflow-x-auto whitespace-pre-wrap rounded bg-muted/60 px-1.5 py-1 font-mono text-[0.9em]"
    >
      {children}
    </span>
  ),
  hr: () => (
    <span
      data-rc-block
      role="separator"
      className="my-1 block border-t border-border"
    />
  ),
  div: ({ children, className }) => (
    <span className={cn("block", className)}>{children}</span>
  ),
  table: ({ children }) => (
    <span
      data-rc-block
      role="table"
      className="my-1 table border-collapse text-[0.9em]"
    >
      {children}
    </span>
  ),
  thead: ({ children }) => (
    <span role="rowgroup" className="table-header-group font-semibold">
      {children}
    </span>
  ),
  tbody: ({ children }) => (
    <span role="rowgroup" className="table-row-group">
      {children}
    </span>
  ),
  tr: ({ children }) => (
    <span role="row" className="table-row">
      {children}
    </span>
  ),
  th: ({ children }) => (
    <span
      role="columnheader"
      className="table-cell border border-border px-1.5 py-0.5 text-left"
    >
      {children}
    </span>
  ),
  td: ({ children }) => (
    <span role="cell" className="table-cell border border-border px-1.5 py-0.5">
      {children}
    </span>
  ),
} as Components;

/** The wrapper classes of the inline level (a second paragraph-level span starts its own line; a lone one flows). */
export const INLINE_LEVEL_WRAPPER_CLASS = cn(
  "rich-content-inline min-w-0 break-words",
  "[&>[data-rc-block]+[data-rc-block]]:mt-1 [&>[data-rc-block]+[data-rc-block]]:block",
);

/**
 * How the inline level renders markdown links.
 *  - `link`  a real link (default).
 *  - `text`  the link's text with its formatting, no anchor — for inline
 *            content that already sits INSIDE a link (a card preview whose
 *            whole card is a `<Link>`); a nested `<a>` is invalid HTML and
 *            breaks hydration.
 */
export type InlineLinks = "link" | "text";

/** The inline map with links rendered as their text (no anchor). */
export const INLINE_LEVEL_ELEMENTS_LINKS_AS_TEXT = {
  ...INLINE_LEVEL_ELEMENTS,
  a: (props) =>
    isHeadingAnchorProps(props) ? null : (
      <span data-rc-link-text="">{props.children}</span>
    ),
} as Components;

/** The inline element map for a `links` choice. */
export function inlineLevelElements(links: InlineLinks = "link"): Components {
  return links === "text" ? INLINE_LEVEL_ELEMENTS_LINKS_AS_TEXT : INLINE_LEVEL_ELEMENTS;
}
