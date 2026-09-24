// ─────────────────────────────────────────────────────────────────────────
// THE SHARED INLINE-MARK ELEMENTS — bold, italic, links, inline code, images,
// task checkboxes, {{variables}} and citation markers.
//
// Moved verbatim out of BasicMarkdownContent (2026-09-23, RC-B2). Every
// rich-content level renders these marks through THIS map, so `**bold**`,
// `$x^2$`, a link or a `{{variable}}` is the same element whether it sits in
// a chat answer (full), a nested <info> section (standard) or a flashcard
// face (inline). The parity test
// (components/rich-content/__tests__/level-parity.test.tsx) holds that.
//
// Deliberately light: no syntax highlighter, no copy menu, no kind registry —
// the inline level imports this.
//
// Environment-neutral (no "use client", 2026-09-24 RC-B2b): the server level
// (components/rich-content/server) spreads this map inside a React Server
// Component. Every stateful piece it names (LinkComponent, Checkbox, the
// variable and citation chips) is its own "use client" module, so it renders
// as a client component from either graph. Keep hooks OUT of this file.
// ─────────────────────────────────────────────────────────────────────────

import React from "react";
import type { Element } from "hast";
import type { MarkdownComponents as Components } from "@/components/markdown-core/markdown-core-types";

/** The extra prop the core passes every element renderer (react-markdown's `ExtraProps`). */
type ExtraProps = { node?: Element };
import { cn } from "@/styles/themes/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { LinkComponent } from "@/components/mardown-display/blocks/links/LinkComponent";
import { MatrxVariableInline } from "@/components/mardown-display/chat-markdown/matrx-variables/MatrxVariableInline";
import { CitationMarkerInline } from "@/components/mardown-display/chat-markdown/citations/CitationMarkerInline";
import {
  detectTextDirection,
  getDirectionClasses,
} from "./prose-prepare";

const INLINE_VARIABLE_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;

/**
 * Splits a plain string into an array mixing literal spans and
 * MatrxVariableInline elements. Used for inline code and fenced-code paths
 * where the remark plugin intentionally leaves `{{var}}` unexpanded.
 */
export function splitWithVariables(text: string): React.ReactNode[] {
  INLINE_VARIABLE_RE.lastIndex = 0;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = INLINE_VARIABLE_RE.exec(text)) !== null) {
    if (match.index > lastIdx) nodes.push(text.slice(lastIdx, match.index));
    nodes.push(<MatrxVariableInline key={i++} data-name={match[1]} />);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes.length > 0 ? nodes : [text];
}

const LinkElement: NonNullable<Components["a"]> = ({ node, href, children }) =>
  href ? <LinkComponent href={href}>{children}</LinkComponent> : <>{children}</>;

/**
 * Inline-mark renderers shared by every level. Module scope, so the map's
 * identity is stable across renders (react-markdown re-renders on change).
 */
export const PROSE_INLINE_ELEMENTS = {
  a: LinkElement,
  input: ({ node, type, checked, disabled, ...props }) => {
    if (type === "checkbox") {
      return (
        <Checkbox
          checked={!!checked}
          disabled={disabled}
          className="mr-2"
        />
      );
    }
    return <input type={type} {...props} />;
  },
  strong: ({ node, children, ...props }) => {
    // NOTE: react-markdown's hast nodes (via hast-util-to-jsx-runtime)
    // never carry a `.parent` reference, so this can never detect a
    // heading ancestor — isInHeading is always false. Left as `false`
    // (not the always-false `node.parent` read it replaced) until real
    // ancestor tracking is added; see BasicMarkdownContent.tsx audit.
    const isInHeading = false;

    // Detect direction for bold text content
    const boldText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const boldDirection = detectTextDirection(boldText);
    const boldDirClasses = getDirectionClasses(boldDirection);

    return (
      <strong
        className={`${isInHeading ? "" : "font-extrabold"} ${boldDirClasses}`}
        dir={boldDirection}
        {...props}
      >
        {children}
      </strong>
    );
  },
  em: ({ node, children, ...props }) => {
    // See the identical note in the `strong` renderer above: react-markdown
    // hast nodes never carry `.parent`, so this is always false.
    const isInHeading = false;

    // Detect direction for italic text content
    const italicText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
    const italicDirection = detectTextDirection(italicText);
    const italicDirClasses = getDirectionClasses(italicDirection);

    return (
      <em
        className={`${isInHeading ? "italic" : "italic text-blue-600 dark:text-blue-400"} ${italicDirClasses}`}
        dir={italicDirection}
        {...props}
      >
        {children}
      </em>
    );
  },
  code: ({ node, className, children, ...props }) => {
    // Fenced code blocks are handled by the `pre` component above.
    // Here we only render inline code spans.
    const langClass = className || "";
    const isFenced = langClass.startsWith("language-");

    if (isFenced) {
      // Let the parent <pre> handle this — return the raw code element
      // so `pre` can extract language and content.
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    // Expand {{variable}} tokens inside inline code spans.
    // The remark plugin intentionally skips inlineCode nodes, so we handle
    // them here at the React render level — the raw source is untouched.
    const rawText =
      typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : null;
    const codeContent =
      rawText && rawText.includes("{{")
        ? splitWithVariables(rawText)
        : children;

    return (
      <code
        className={cn(
          "px-1.5 py-0 rounded font-mono text-sm font-medium",
          "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
          className,
        )}
        style={{
          overflowWrap: "anywhere",
          wordBreak: "normal",
        }}
        {...props}
      >
        {codeContent}
      </code>
    );
  },
  img: ({ node, ...props }) => (
    // Inline images flow rather than fill the width, so multiple images on
    // one line sit side by side and wrap. Standalone images on their own
    // line take the dedicated full-width ImageBlock path (the splitter
    // only leaves an image here when it shares a line with other content).
    <img
      className="inline-block h-auto max-w-full rounded-md my-2 mr-2 object-contain align-top"
      style={{ maxHeight: 700 }}
      {...props}
      alt={props.alt || "Image"}
    />
  ),
  br: ({ node, ...props }) => <br />,
  span: ({ node, className, children, ...props }) => {
    // Regular span - no special handling needed
    return (
      <span className={className} {...props}>
        {children}
      </span>
    );
  },
  "matrx-variable": ({ node, ...props }: React.HTMLAttributes<HTMLElement> & ExtraProps) => (
    <MatrxVariableInline {...(props as React.ComponentProps<typeof MatrxVariableInline>)} />
  ),
  // Inline citation marker `<matrxcite n="…" />` (emitted into display
  // text by message-citations.insertCitationMarkers, converted to a
  // `matrx-cite` element by remarkMatrxCite) → numbered superscript chip.
  "matrx-cite": ({ node, ...props }: React.HTMLAttributes<HTMLElement> & ExtraProps) => (
    <CitationMarkerInline {...(props as React.ComponentProps<typeof CitationMarkerInline>)} />
  ),
} as Components;
