// ─────────────────────────────────────────────────────────────────────────
// THE PROSE LEAF'S BLOCK ELEMENTS — paragraphs, headings, lists, quotes,
// fenced code (as InlineCodeSnippet), rules and tables — plus the frame the
// prose leaf wraps them in.
//
// Moved verbatim out of BasicMarkdownContent (2026-09-24, RC-B2b) so the
// client prose leaf (BasicMarkdownContent, used by the standard and full
// levels) and the server level (components/rich-content/server) render prose
// through ONE map. Environment-neutral: no "use client", no hooks — every
// stateful piece it names (InlineCodeSnippet, MarkdownTableScrollArea, the
// inline-mark chips) is its own client module. Parity guard:
// components/rich-content/__tests__/server-level-parity.test.tsx.
// ─────────────────────────────────────────────────────────────────────────

import React from "react";
import type { Element } from "hast";
import type { MarkdownComponents as Components } from "@/components/markdown-core/markdown-core-types";
import { InlineCodeSnippet } from "@/components/mardown-display/chat-markdown/InlineCodeSnippet";
import { MarkdownTableScrollArea } from "@/components/mardown-display/tables/MarkdownTableScrollArea";
import {
  THICK_HR_SENTINEL,
  detectTextDirection,
  getDirectionClasses,
  getDirectionFontSize,
} from "./prose-prepare";
import { PROSE_INLINE_ELEMENTS } from "./prose-inline-elements";

/** The extra prop the core passes every element renderer (react-markdown's `ExtraProps`). */
type ExtraProps = { node?: Element };

/** Props react-markdown passes to a `<code>` renderer/element — the only fields this file reads off `child.props`. */
type MarkdownCodeElementProps = React.HTMLAttributes<HTMLElement> &
  ExtraProps & { className?: string };

// Simple List Item Component
const ListItemComponent: React.FC<{
  children: React.ReactNode;
  node?: Element;
  /** A footnote item's id (`user-content-fn-1`) — references and back-links target it. */
  id?: string;
}> = ({ children, node, id }) => {
  // Detect direction for list item content
  const itemText =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children.join("")
        : "";
  const itemDirection = detectTextDirection(itemText);

  // Check if this is a task list item (contains a checkbox)
  const nodeClassName = node?.properties?.className;
  const isTaskItem = Array.isArray(nodeClassName) && nodeClassName.includes("task-list-item");

  // For task items, just return the content without additional styling.
  // NOTE: do NOT use `display: flex` here — it turns every adjacent text/element
  // (e.g. "Makes ", <strong>...</strong>, " before...") into separate flex items,
  // and browsers discard whitespace at the edges of flex items. That collapses
  // the spaces around bold text inside checklist lines. Inline flow preserves
  // whitespace correctly, and the Checkbox is inline-block so it still aligns
  // with the text baseline.
  if (isTaskItem) {
    return (
      <li
        id={id}
        className={`mb-1 ${getDirectionFontSize(itemDirection)} ${getDirectionClasses(itemDirection)}`}
        dir={itemDirection}
      >
        {children}
      </li>
    );
  }

  // For regular list items, use simple styling
  return (
    <li
      id={id}
      className={`mb-1 ${getDirectionFontSize(itemDirection)} ${getDirectionClasses(itemDirection)}`}
      dir={itemDirection}
    >
      {children}
    </li>
  );
};

/**
 * A markdown table in the prose leaf's scroll frame. `after` renders beside
 * it (BasicMarkdownContent's admin-only render-path diagnostic).
 */
export function renderProseTable(
  { node, children, ...props }: React.TableHTMLAttributes<HTMLTableElement> & ExtraProps,
  after?: React.ReactNode,
) {
  return (
    <div>
      <MarkdownTableScrollArea className="my-3 rounded-md border border-border">
        <table className="w-full text-sm border-collapse" {...props}>
          {children}
        </table>
      </MarkdownTableScrollArea>
      {after}
    </div>
  );
}

/** Every element the prose leaf renders. Module scope: stable identity. */
export const PROSE_BLOCK_ELEMENTS = {
  ...PROSE_INLINE_ELEMENTS,
  p: ({ node, children, ...props }) => {
    // Blank line placeholder — render as an empty line with no extra margin
    const childArray = React.Children.toArray(children);
    if (childArray.length === 1 && childArray[0] === "\u00A0") {
      return <div className="h-[0.75em]" />;
    }

    // Thick blue thematic break — sentinel emitted by preprocessContent for
    // standalone `={3,}` lines. Rendered as a heavier blue rule than the
    // default `---` <hr>, with extra vertical breathing room.
    if (
      childArray.length === 1 &&
      childArray[0] === THICK_HR_SENTINEL
    ) {
      return (
        <hr
          className="my-5 border-0 h-[3px] rounded-full bg-blue-500 dark:bg-blue-400"
          role="separator"
        />
      );
    }

    // Check if this paragraph only contains math (display math should be centered)
    let isMathOnly = false;

    if (childArray.length === 1) {
      const child = childArray[0];
      // Check if it's a React element with katex className
      if (
        child &&
        typeof child === "object" &&
        "props" in child &&
        child.props &&
        typeof child.props === "object" &&
        "className" in child.props &&
        typeof child.props.className === "string"
      ) {
        isMathOnly = child.props.className.includes("katex");
      }
    }

    // Detect direction for this specific paragraph
    // Better text extraction that handles nested React elements
    const extractTextFromChildren = (children: React.ReactNode): string => {
      if (typeof children === "string") return children;
      if (Array.isArray(children)) {
        return children
          .map((child) => extractTextFromChildren(child))
          .join("");
      }
      if (
        children &&
        typeof children === "object" &&
        "props" in children &&
        children.props &&
        typeof children.props === "object" &&
        "children" in children.props
      ) {
        return extractTextFromChildren(children.props.children as React.ReactNode);
      }
      return "";
    };

    const paragraphText = extractTextFromChildren(children);
    const paragraphDirection = detectTextDirection(paragraphText);
    const paragraphDirClasses = getDirectionClasses(paragraphDirection);

    // If it's only math, center it and override direction classes
    if (isMathOnly) {
      return (
        <p
          className="font-sans tracking-wide leading-relaxed text-base mb-4 text-center"
          {...props}
        >
          {children}
        </p>
      );
    }

    return (
      <p
        className={`font-sans tracking-wide leading-relaxed ${getDirectionFontSize(paragraphDirection)} mb-2 pl-0 ml-0 ${paragraphDirClasses}`}
        dir={paragraphDirection}
        {...props}
      >
        {children}
      </p>
    );
  },
  blockquote: ({ node, children, ...props }) => {
    // Detect direction for blockquote content
    const blockquoteText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const blockquoteDirection = detectTextDirection(blockquoteText);
    const isRtl = blockquoteDirection === "rtl";

    return (
      <blockquote
        className={`${isRtl ? "pr-4 border-r-4" : "pl-4 border-l-4"} py-3 border-blue-200 dark:border-blue-700 italic text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-blue-950/20 ${getDirectionClasses(blockquoteDirection)}`}
        dir={blockquoteDirection}
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  ul: ({ node, children, ...props }) => {
    // Detect direction for list content
    const listText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const listDirection = detectTextDirection(listText);

    return (
      <ul
        // Bullet markers by nesting depth: L1 filled disc, L2 hollow
        // circle, L3+ dash. The full cascade is applied to every <ul>; the
        // ancestor descendant-selectors ([&_ul], [&_ul_ul]) have higher
        // specificity than a deeper list's own `list-disc`, so each level
        // resolves to the right marker regardless of how deep it is.
        className={`matrx-md-ul mb-3 leading-relaxed ${getDirectionFontSize(listDirection)} pl-6 ${getDirectionClasses(listDirection)}`}
        dir={listDirection}
        {...props}
      >
        {children}
      </ul>
    );
  },
  ol: ({ node, children, ...props }) => {
    // Detect direction for list content
    const listText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const listDirection = detectTextDirection(listText);

    return (
      <ol
        // Numbering by nesting depth: L1 decimal (1.2.3.), L2 lower-roman
        // (i.ii.iii.), L3+ lower-alpha (a.b.c.). Same specificity-cascade
        // approach as <ul> above.
        className={`matrx-md-ol mb-3 leading-relaxed ${getDirectionFontSize(listDirection)} pl-6 ${getDirectionClasses(listDirection)}`}
        dir={listDirection}
        {...props}
      >
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <ListItemComponent node={node} id={props.id}>
        {children}
      </ListItemComponent>
    );
  },
  h1: ({ node, children, ...props }) => {
    const headingText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const headingDirection = detectTextDirection(headingText);

    return (
      <h1
        className={`text-xl text-blue-500 font-bold mt-4 mb-2 font-heading ${getDirectionClasses(headingDirection)}`}
        dir={headingDirection}
        {...props}
      >
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    const headingText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const headingDirection = detectTextDirection(headingText);

    return (
      <h2
        className={`text-lg text-blue-500 font-semibold mt-3 mb-1.5 font-heading ${getDirectionClasses(headingDirection)}`}
        dir={headingDirection}
        {...props}
      >
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    const headingText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const headingDirection = detectTextDirection(headingText);

    return (
      <h3
        className={`text-base text-blue-500 font-semibold mt-2 mb-1 font-heading ${getDirectionClasses(headingDirection)}`}
        dir={headingDirection}
        {...props}
      >
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    const headingText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const headingDirection = detectTextDirection(headingText);

    return (
      <h4
        className={`text-sm text-blue-400 font-semibold mt-2 mb-1 font-heading ${getDirectionClasses(headingDirection)}`}
        dir={headingDirection}
        {...props}
      >
        {children}
      </h4>
    );
  },
  pre: ({ node, children, ...props }) => {
    // react-markdown wraps fenced code in <pre><code>. Extract the code
    // element and render via InlineCodeSnippet for proper formatting.
    const childArray = React.Children.toArray(children);
    const codeChild = childArray.find((child) => {
      if (!React.isValidElement<MarkdownCodeElementProps>(child)) return false;
      const p = child.props;
      return p.node?.tagName === "code" || typeof p.className === "string";
    });

    if (React.isValidElement<MarkdownCodeElementProps>(codeChild)) {
      const codeProps = codeChild.props;
      const langClass = String(codeProps.className || "");
      const langMatch = langClass.match(/language-(\w+)/);
      const language = langMatch?.[1];
      const codeText = String(codeProps.children ?? "").replace(
        /\n$/,
        "",
      );

      if (codeText) {
        return (
          <InlineCodeSnippet
            code={codeText}
            language={language}
            className="my-2"
            renderVariables
          />
        );
      }
    }

    return (
      <pre className="my-3" {...props}>
        {children}
      </pre>
    );
  },
  hr: ({ node, ...props }) => (
    <hr
      className="my-3 border-t border-gray-300 dark:border-gray-600"
      {...props}
    />
  ),
  div: ({ node, className, children, ...props }) => {
    // Regular div - no special handling needed
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  },
  table: (props) => renderProseTable(props),
  thead: ({ node, children, ...props }) => (
    <thead className="bg-muted/50" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ node, children, ...props }) => (
    <tbody {...props}>{children}</tbody>
  ),
  tr: ({ node, children, ...props }) => (
    <tr
      className="border-t border-border/30 hover:bg-muted/20 transition-colors"
      {...props}
    >
      {children}
    </tr>
  ),
  th: ({ node, children, ...props }) => (
    <th
      className="px-3 py-1.5 text-left text-xs font-semibold text-foreground border-r border-border/30 last:border-r-0"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ node, children, ...props }) => (
    <td
      className="px-3 py-1.5 text-foreground border-r border-border/30 last:border-r-0"
      {...props}
    >
      {children}
    </td>
  ),
} as Components;

/** The prose frame's scoped CSS (display-math centering, indented-code blocks). */
export const PROSE_FRAME_CSS = `
                    /* Center display math that appears after a line break */
                    .math-content-wrapper p > .block + .katex {
                        display: block;
                        text-align: center;
                        margin: 1em 0;
                        font-size: 1.5em;
                    }
                    /* Increase font size for standalone math paragraphs */
                    .math-content-wrapper p.text-center .katex {
                        font-size: 1.5em;
                    }
                    /* Override pre tags that contain inline code (indented text blocks) */
                    .math-content-wrapper pre:has(> code.bg-blue-100),
                    .math-content-wrapper pre:has(> code.dark\\:bg-blue-900\\/30) {
                        white-space: pre-wrap;
                        word-wrap: break-word;
                        overflow-wrap: anywhere;
                        font-family: inherit;
                        background: transparent;
                        padding: 0;
                        margin: 0;
                    }
                    /* Make the code inside these pre tags behave like inline code */
                    .math-content-wrapper pre:has(> code.bg-blue-100) > code,
                    .math-content-wrapper pre:has(> code.dark\\:bg-blue-900\\/30) > code {
                        white-space: normal;
                        display: inline;
                        overflow-wrap: anywhere;
                        word-break: normal;
                    }
                `;

/** The prose frame's classes for a detected text direction. */
export function proseFrameClass(direction: "rtl" | "ltr"): string {
  return `relative my-2 group ${getDirectionClasses(direction)} math-content-wrapper overflow-x-hidden min-w-0 break-words`;
}

/**
 * The prose map for a STATIC root: `matrx-nested` (a directive container's
 * block body) renders through the root's own routing instead of the
 * client-only NestedBody, so its text is in the server HTML.
 */
export function proseElementsWithNested(
  renderNested: ((source: string) => React.ReactNode) | undefined,
): Components {
  if (!renderNested) return PROSE_BLOCK_ELEMENTS;
  return {
    ...PROSE_BLOCK_ELEMENTS,
    "matrx-nested": (props: { "data-source"?: string }) =>
      renderNested(String(props["data-source"] ?? "")),
  } as Components;
}
