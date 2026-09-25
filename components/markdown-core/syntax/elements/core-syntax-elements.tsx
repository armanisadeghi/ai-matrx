// ─────────────────────────────────────────────────────────────────────────
// THE CORE'S DEFAULT ELEMENTS for the extended syntax — merged UNDER every
// caller's element map by MarkdownCoreImpl and MarkdownCoreServer, so a
// callout, a wikilink, tabs, a table of contents, a CSV table, a
// cross-reference, a task checkbox and an in-document link render the same
// everywhere without any caller wiring. A caller that maps the same tag wins
// (the inline level maps the block ones to spans).
//
// Environment-neutral (no "use client"): every stateful element is its own
// client module, so the server level renders through this map too.
// ─────────────────────────────────────────────────────────────────────────

import type React from "react";
import type { MarkdownComponents } from "../../markdown-core-types";
import { CalloutIcon } from "./CalloutIcon";
import { CrossRef } from "./CrossRef";
import { CsvFence } from "./CsvFence";
import { DetailsElement, KbdElement, SummaryElement } from "./DetailsElements";
import { InDocAnchor } from "./InDocAnchor";
import { MatrxTab, MatrxTabs } from "./MatrxTabs";
import { NestedBody } from "./NestedBody";
import { TableOfContents } from "./TableOfContents";
import { TaskCheckbox } from "./TaskCheckbox";
import { WikiEmbed } from "./WikiEmbed";
import { WikiLink } from "./WikiLink";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode; node?: unknown };

/** A task checkbox or any other input. Shared with the prose leaf's element map. */
export function renderMarkdownInput({ node: _node, type, checked, ...rest }: AnyProps & { type?: string; checked?: boolean }) {
  if (type === "checkbox") return <TaskCheckbox checked={!!checked} {...(rest as Record<string, never>)} />;
  return <input type={type} {...(rest as React.InputHTMLAttributes<HTMLInputElement>)} />;
}

/** True for an in-document link (`#id`) — footnotes, anchors, contents, cross-references. */
export function isInDocHref(href: unknown): href is string {
  return typeof href === "string" && href.startsWith("#") && href.length > 1;
}

export const CORE_SYNTAX_ELEMENTS = {
  a: ({ node: _node, href, children, ...rest }: AnyProps & { href?: string }) =>
    isInDocHref(href) ? (
      <InDocAnchor href={href} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </InDocAnchor>
    ) : (
      <a href={href} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    ),
  input: renderMarkdownInput,
  details: DetailsElement,
  summary: SummaryElement,
  kbd: KbdElement,
  "matrx-callout-icon": CalloutIcon,
  "matrx-wikilink": WikiLink,
  "matrx-embed": WikiEmbed,
  "matrx-tabs": MatrxTabs,
  "matrx-tab": MatrxTab,
  "matrx-toc": TableOfContents,
  "matrx-csv": CsvFence,
  "matrx-xref": CrossRef,
  "matrx-nested": NestedBody,
} as unknown as MarkdownComponents;

/** Merge a caller's map over the core defaults (the caller wins per tag). */
export function withCoreSyntaxElements(components: MarkdownComponents | undefined): MarkdownComponents {
  return components ? ({ ...CORE_SYNTAX_ELEMENTS, ...components } as MarkdownComponents) : CORE_SYNTAX_ELEMENTS;
}

const inlineBlock = ({ children }: AnyProps) => (
  <span data-rc-block className="block">
    {children}
  </span>
);
const inlineSpan = ({ children }: AnyProps) => <span>{children}</span>;

/**
 * The `inline` level's versions of the block constructs this syntax adds —
 * phrasing content only (every one a <span>), nothing dropped.
 */
export const INLINE_SYNTAX_ELEMENTS = {
  details: inlineBlock,
  summary: ({ children }: AnyProps) => <span className="font-medium">{children} </span>,
  aside: inlineBlock,
  figure: inlineBlock,
  figcaption: ({ children }: AnyProps) => <span className="block text-[0.9em] text-muted-foreground">{children}</span>,
  section: inlineBlock,
  nav: inlineBlock,
  dl: inlineBlock,
  dt: ({ children }: AnyProps) => <span className="block font-semibold">{children}</span>,
  dd: ({ children }: AnyProps) => <span className="block pl-3">{children}</span>,
  "matrx-tabs": inlineBlock,
  "matrx-tab": inlineBlock,
  "matrx-toc": () => null,
  "matrx-csv": ({ ...props }: AnyProps) => (
    <span data-rc-block className="block whitespace-pre-wrap font-mono text-[0.85em]">
      {String(props["data-source"] ?? "")}
    </span>
  ),
  "matrx-embed": inlineSpan,
  "matrx-nested": ({ ...props }: AnyProps) => (
    <span data-rc-block className="block whitespace-pre-wrap">
      {String(props["data-source"] ?? "")}
    </span>
  ),
} as unknown as MarkdownComponents;
