"use client";

// ─────────────────────────────────────────────────────────────────────────
// Part of the RICH DOCUMENT rendering engine (the "basement"). This is the
// minimal renderer variant.
//
// IMPORTANT: despite the react-markdown / remark imports below, this is NOT a
// thin markdown wrapper — it is one piece of a multi-thousand-line content
// runtime (interactive flashcards, live diagrams, wired task lists, tool-call
// traces, code surfaces, realtime feeds, plan viewers, …). Do not "simplify"
// it or swap it for a plugin.
//
// FRONT DOOR: prefer `<RichDocument>` (features/rich-document/RichDocument.tsx)
// — it wraps this engine and adds the action toolkit. See
// features/rich-document/FEATURE.md and the `rich-document-actions` skill.
// ─────────────────────────────────────────────────────────────────────────

import React from "react";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/styles/themes/utils";
import { PencilIcon } from "lucide-react";
import { useState, useMemo } from "react";
import { LinkComponent } from "@/components/mardown-display/blocks/links/LinkComponent";
import { InlineCopyButton } from "@/components/matrx/buttons/MarkdownCopyButton";
import { Checkbox } from "@/components/ui/checkbox";
import { InlineCodeSnippet } from "@/components/mardown-display/chat-markdown/InlineCodeSnippet";
import remarkMatrxVariable from "@/components/mardown-display/chat-markdown/matrx-variables/remarkMatrxVariable";
import { MatrxVariableInline } from "@/components/mardown-display/chat-markdown/matrx-variables/MatrxVariableInline";

const INLINE_VARIABLE_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;

/**
 * Splits a plain string into an array mixing literal spans and
 * MatrxVariableInline elements. Used for inline code and fenced-code paths
 * where the remark plugin intentionally leaves `{{var}}` unexpanded.
 */
function splitWithVariables(text: string): React.ReactNode[] {
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

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

// Detect text direction utility
const detectTextDirection = (text: string): "rtl" | "ltr" => {
  // RTL Unicode ranges for Arabic, Hebrew, Persian, Urdu, etc.
  const rtlRanges = [
    /[\u0590-\u05FF]/, // Hebrew
    /[\u0600-\u06FF]/, // Arabic
    /[\u0750-\u077F]/, // Arabic Supplement
    /[\u08A0-\u08FF]/, // Arabic Extended-A
    /[\uFB50-\uFDFF]/, // Arabic Presentation Forms-A
    /[\uFE70-\uFEFF]/, // Arabic Presentation Forms-B
    /[\u200F]/, // Right-to-Left Mark
    /[\u202E]/, // Right-to-Left Override
  ];

  // Count RTL and LTR characters
  let rtlCount = 0;
  let ltrCount = 0;

  for (const char of text) {
    if (rtlRanges.some((range) => range.test(char))) {
      rtlCount++;
    } else if (/[a-zA-Z]/.test(char)) {
      ltrCount++;
    }
  }

  // If RTL characters are more than 10% of alphabetic characters, consider it RTL
  // Lowered from 30% to 10% to catch mixed content better
  const totalAlphabetic = rtlCount + ltrCount;
  if (totalAlphabetic === 0) return "ltr";

  const direction = rtlCount / totalAlphabetic > 0.1 ? "rtl" : "ltr";

  return direction;
};

// Get direction classes based on text direction
const getDirectionClasses = (direction: "rtl" | "ltr") => {
  return direction === "rtl" ? "text-right rtl" : "text-left ltr";
};

// Get font size based on text direction
const getDirectionFontSize = (direction: "rtl" | "ltr") => {
  return direction === "rtl"
    ? "text-base" // Bigger for RTL (Arabic/Persian)
    : "text-sm"; // Smaller for LTR (English)
};

// Simple List Item Component
const ListItemComponent: React.FC<{
  children: React.ReactNode;
  node?: any;
}> = ({ children, node }) => {
  // Detect direction for list item content
  const itemText =
    typeof children === "string"
      ? children
      : Array.isArray(children)
        ? children.join("")
        : "";
  const itemDirection = detectTextDirection(itemText);

  // Check if this is a task list item (contains a checkbox)
  const isTaskItem = node?.properties?.className?.includes("task-list-item");

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
      className={`mb-1 ${getDirectionFontSize(itemDirection)} ${getDirectionClasses(itemDirection)}`}
      dir={itemDirection}
    >
      {children}
    </li>
  );
};

interface BasicMarkdownContentProps {
  content: string;
  isStreamActive?: boolean;
  onEditRequest?: () => void;
  messageId?: string;
  showCopyButton?: boolean;
}

export const BasicMarkdownContent: React.FC<BasicMarkdownContentProps> = ({
  content,
  isStreamActive,
  onEditRequest,
  messageId,
  showCopyButton = true,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  // Detect text direction
  const textDirection = useMemo(() => detectTextDirection(content), [content]);
  const directionClasses = getDirectionClasses(textDirection);

  // Memoize LinkComponent wrapper to prevent recreation during streaming
  const LinkWrapper = useMemo(() => {
    return ({ node, href, children, ...props }: any) => (
      <LinkComponent href={href}>{children}</LinkComponent>
    );
  }, []); // Empty deps - this doesn't need to change

  const preprocessContent = (rawContent: string): string => {
    let processed = rawContent;

    // Pre-escape XML/HTML-style angle-bracket tokens.
    //
    // Without this, CommonMark treats `<tag>` at the start of a line as the
    // start of an HTML block (spec types 6 and 7). The block extends until the
    // next blank line, and the parser emits the entire region as a single text
    // node with embedded raw newlines — which collapse visually because they
    // never reach `remark-breaks`. The result: multi-line bare XML like
    //   <tools>
    //     <tool name="db_insert">...</tool>
    //     <tool name="db_query">...</tool>
    //   </tools>
    // renders as one wrapped paragraph instead of preserving its structure.
    //
    // Escaping `<` and `>` to entities prevents HTML-block detection, so the
    // content stays as ordinary paragraph text. `remark-breaks` then turns each
    // single newline into a <br>, preserving the visual structure. CommonMark
    // decodes `&lt;` and `&gt;` back to `<` and `>` in text, so inline
    // references like <Admin> or <Resource> still render as the literal
    // characters on screen.
    // Escape XML/HTML-style angle-bracket tokens, but SKIP content inside
    // backtick code spans — HTML entities are not decoded inside code spans,
    // so escaping there causes literal "&lt;" to appear on screen.
    processed = processed.replace(
      /(`+)([\s\S]*?)\1|<(\/?[\w][\w-]*)([^>]*?)>/g,
      (match, backticks, _codeContent, tagName, tagAttrs) => {
        if (backticks !== undefined) return match; // preserve code spans verbatim
        return `&lt;${tagName}${tagAttrs}&gt;`; // escape tags outside code spans
      },
    );

    // Replace leading spaces on each line with non-breaking spaces so HTML
    // doesn't collapse them — this preserves indentation visually.
    processed = processed.replace(/^( +)/gm, (spaces) =>
      "\u00A0\u00A0".repeat(spaces.length),
    );

    // Convert bracketed bare URLs [https://...] into proper markdown links
    // This prevents dangling brackets when long URLs wrap across lines
    // Matches [URL] where URL starts with http(s):// and is not followed by () (which would be a standard markdown link)
    processed = processed.replace(
      /\[(https?:\/\/[^\]\s]+)\](?!\()/g,
      "[$1]($1)",
    );

    // Convert LaTeX-style math delimiters to markdown math notation
    // \[...\] → $$...$$ (display/block math)
    // IMPORTANT: Display math needs blank lines before and after for remark-math to recognize it
    processed = processed.replace(
      /\\\[([\s\S]*?)\\\]/g,
      (match, mathContent) => {
        return `\n\n$$${mathContent}$$\n\n`;
      },
    );
    // \(...\) → $$...$$ (display math — single-dollar inline disabled to prevent false positives)
    processed = processed.replace(/\\\((.*?)\\\)/g, (match, mathContent) => {
      return `\n\n$$${mathContent}$$\n\n`;
    });

    // Support non-standard [...] format for display math (some smaller models use this)
    // Only convert if: contains LaTeX commands (\), multiline or substantial, NOT a markdown link
    processed = processed.replace(
      /\[[\s\n]*([\s\S]*?)[\s\n]*\](?!\()/g,
      (match, content) => {
        const trimmedContent = content.trim();

        // Case 1: Contains LaTeX commands (backslash) - safe to convert if multiline or substantial
        if (
          content.includes("\\") &&
          (content.includes("\n") || content.length >= 3)
        ) {
          return `\n\n$$${content}$$\n\n`;
        }

        // Case 2: Pure math expression without LaTeX commands
        // Only if multiline format (brackets on own lines) and looks like math
        const isMultilineBrackets =
          match.startsWith("[\n") || match.startsWith("[ \n");
        if (isMultilineBrackets && trimmedContent.length >= 3) {
          // Check for math operators
          const hasMathOperators = /[+\-=×÷*/]/.test(trimmedContent);
          // Check it's not prose (doesn't contain common text words)
          const hasProseWords =
            /\b(note|step|example|optional|the|is|are|was|were|for|with|this|that)\b/i.test(
              trimmedContent,
            );
          // Check that it's mostly math-like (numbers, operators, parentheses, variables)
          const mathLikeRatio =
            (trimmedContent.match(/[0-9+\-=×÷*/()xy\s]/g) || []).length /
            trimmedContent.length;

          if (hasMathOperators && !hasProseWords && mathLikeRatio > 0.6) {
            return `\n\n$$${content}$$\n\n`;
          }
        }

        // Otherwise, leave it as-is (could be regular brackets)
        return match;
      },
    );

    // Normalize asterisk bullets (*) to dash bullets (-) to avoid ambiguity with bold markers (**)
    // Both render identically, but dash bullets don't conflict with bold syntax
    // Preserve exact whitespace after the bullet marker
    processed = processed.replace(/^(\s*)\*([ \t]+)/gm, "$1-$2");

    // Force list termination before bold text that starts with a number (like **4. Test**).
    // CommonMark can treat single blank lines as "loose list" continuations, so we need
    // to inject an unambiguous block-level break between the list and the next paragraph.
    //
    // We use `&nbsp;` (a single non-breaking space on its own paragraph) instead of an
    // HTML comment (`<!-- -->`) because react-markdown is configured WITHOUT `rehype-raw`
    // (see the disabled-block comment above) — meaning raw HTML, including comments, is
    // emitted as literal text. The `&nbsp;` paragraph is rendered invisibly by the `p`
    // component below (it detects a single `\u00A0` child and emits a zero-content
    // spacer div), so it visually disappears while still acting as a block-level break.
    processed = processed.replace(
      /(^[ \t]*-[ \t]+[^\n]+)\n\n(\*\*\d)/gm,
      "$1\n\n&nbsp;\n\n$2",
    );

    // Fix setext-style heading patterns by ensuring there's a blank line before ---
    // This prevents paragraph text from being interpreted as h2 headings
    processed = processed.replace(/([^\n])\n---/g, "$1\n\n---");

    // Same guard for `===` — without a preceding blank line, CommonMark treats
    // the line above as an H1 setext heading. We use standalone `={3,}` lines
    // as a thick blue thematic break (see the `p` renderer below), so force a
    // blank line before any pure-equals line to keep its meaning paragraph-level.
    processed = processed.replace(
      /([^\n])\n(={3,})[ \t]*(?=\n|$)/g,
      "$1\n\n$2",
    );

    // Convert standalone `===` (3+ equals on their own line) into a sentinel
    // paragraph. The `p` renderer below detects this exact token and emits a
    // thicker blue <hr>. We use a private-use unicode marker so it cannot
    // collide with any plausible user content.
    processed = processed.replace(
      /^[ \t]*={3,}[ \t]*$/gm,
      "\uE000THICK_HR\uE000",
    );

    // Ensure proper line breaks after bold text that should start a new line
    // This handles cases like "**Meta Title:**\n[content]" to ensure proper paragraph separation
    // BUT exclude cases where bold text is immediately followed by a list item (including indented ones)
    processed = processed.replace(/(\*\*[^*]+\*\*)\n([^\n*\-\s])/g, "$1\n\n$2");

    // Ensure proper line breaks before and after italic text that spans multiple lines
    // This handles cases where italic text should be on its own line
    processed = processed.replace(
      /([^\n])\n(\*[^*]+\*)\n([^\n])/g,
      "$1\n\n$2\n\n$3",
    );

    // Handle cases where there are single line breaks between different formatting elements
    // that should be treated as separate paragraphs
    // BUT exclude cases where formatting is immediately followed by a list item
    processed = processed.replace(
      /(\*\*[^*]+\*\*|\*[^*]+\*)\n([^\n*\s\-])/g,
      "$1\n\n$2",
    );

    // Ensure proper separation between list items and following paragraph content
    // This handles cases where content follows a list without proper spacing

    // First, handle nested/indented list items (most specific case)
    // Use negative lookahead to exclude actual list markers (* or -) but allow bold text (**)
    processed = processed.replace(
      /(^|\n)(\s+[*-] .+)\n(?!\s*[*-]\s)([^\n\s\-#\d][^\n]*)/gm,
      "$1$2\n\n$3",
    );

    // Then handle regular list items
    // Use negative lookahead to exclude actual list markers but allow bold text
    processed = processed.replace(
      /(^|\n)(- .+)\n(?!\s*[*-]\s)([^\n\s\-#\d][^\n]*)/gm,
      "$1$2\n\n$3",
    );
    processed = processed.replace(
      /(^|\n)(\d+\. .+)\n(?!\s*\d+[.)]\s)([^\n\s\-#\d][^\n]*)/gm,
      "$1$2\n\n$3",
    );
    processed = processed.replace(
      /(^|\n)(\d+\) .+)\n(?!\s*\d+[.)]\s)([^\n\s\-#\d][^\n]*)/gm,
      "$1$2\n\n$3",
    );

    // Convert intentional blank lines into &nbsp; paragraphs so they render
    // at the same height as a normal line of text, capped at 2 visible blank lines.
    // A standard paragraph break is \n\n (2 chars) — that needs 0 spacers.
    // Only \n\n\n+ (extra blank lines beyond the paragraph break) add spacers.
    processed = processed.replace(/\n{2,}/g, (match) => {
      const blankLines = Math.min(match.length - 2, 2);
      return "\n\n" + "&nbsp;\n\n".repeat(blankLines);
    });

    return processed;
  };

  const processedContent = preprocessContent(content);

  const handleEdit = () => {
    onEditRequest?.();
  };

  // Conditional mouse event handlers - only active when stream is not active
  const handleMouseEnter = !isStreamActive
    ? () => setIsHovering(true)
    : undefined;
  const handleMouseLeave = !isStreamActive
    ? () => setIsHovering(false)
    : undefined;

  // Memoize components to prevent recreation during streaming
  const components = useMemo(
    () => ({
      input: ({ node, type, checked, disabled, ...props }: any) => {
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
      p: ({ node, children, ...props }: any) => {
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
          childArray[0] === "\uE000THICK_HR\uE000"
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
          const child = childArray[0] as any;
          // Check if it's a React element with katex className
          if (
            child &&
            typeof child === "object" &&
            child.props &&
            child.props.className
          ) {
            isMathOnly = child.props.className.includes("katex");
          }
        }

        // Detect direction for this specific paragraph
        // Better text extraction that handles nested React elements
        const extractTextFromChildren = (children: any): string => {
          if (typeof children === "string") return children;
          if (Array.isArray(children)) {
            return children
              .map((child) => extractTextFromChildren(child))
              .join("");
          }
          if (children && typeof children === "object" && children.props) {
            return extractTextFromChildren(children.props.children);
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
      strong: ({ node, children, ...props }) => {
        const parentTagName = node.parent?.tagName?.toLowerCase() || "";
        const isInHeading = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(
          parentTagName,
        );

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
        const parentTagName = node.parent?.tagName?.toLowerCase() || "";
        const isInHeading = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(
          parentTagName,
        );

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
            className={`list-disc [&_ul]:list-[circle] [&_ul_ul]:list-dash mb-3 leading-relaxed ${getDirectionFontSize(listDirection)} pl-6 ${getDirectionClasses(listDirection)}`}
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
            className={`list-decimal [&_ol]:list-[lower-roman] [&_ol_ol]:list-[lower-alpha] mb-3 leading-relaxed ${getDirectionFontSize(listDirection)} pl-6 ${getDirectionClasses(listDirection)}`}
            dir={listDirection}
            {...props}
          >
            {children}
          </ol>
        );
      },
      li: ({ node, children, ...props }) => {
        return <ListItemComponent node={node}>{children}</ListItemComponent>;
      },
      a: LinkWrapper,
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
        const codeChild = childArray.find((child: any) => {
          if (!React.isValidElement(child)) return false;
          const p = child.props as Record<string, any>;
          return (
            p?.node?.tagName === "code" || typeof p?.className === "string"
          );
        });

        if (React.isValidElement(codeChild)) {
          const codeProps = codeChild.props as Record<string, any>;
          const langClass = String(codeProps.className || "");
          const langMatch = langClass.match(/language-(\w+)/);
          const language = langMatch?.[1];
          const codeText = String(codeProps.children ?? "").replace(/\n$/, "");

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
      code: ({ node, inline, className, children, ...props }) => {
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
        <img
          className="w-full h-auto rounded-md my-4 object-contain max-w-[700px]"
          style={{ maxHeight: 700 }}
          {...props}
          alt={props.alt || "Image"}
        />
      ),
      hr: ({ node, ...props }) => (
        <hr
          className="my-3 border-t border-gray-300 dark:border-gray-600"
          {...props}
        />
      ),
      br: ({ node, ...props }) => <br />,
      div: ({ node, className, children, ...props }: any) => {
        // Regular div - no special handling needed
        return (
          <div className={className} {...props}>
            {children}
          </div>
        );
      },
      span: ({ node, className, children, ...props }: any) => {
        // Regular span - no special handling needed
        return (
          <span className={className} {...props}>
            {children}
          </span>
        );
      },
      "matrx-variable": ({ node, ...props }: any) => (
        <MatrxVariableInline {...props} />
      ),
      table: ({ node, children, ...props }: any) => (
        <div className="my-3 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm border-collapse" {...props}>
            {children}
          </table>
        </div>
      ),
      thead: ({ node, children, ...props }: any) => (
        <thead className="bg-muted/50" {...props}>
          {children}
        </thead>
      ),
      tbody: ({ node, children, ...props }: any) => (
        <tbody {...props}>{children}</tbody>
      ),
      tr: ({ node, children, ...props }: any) => (
        <tr
          className="border-t border-border/30 hover:bg-muted/20 transition-colors"
          {...props}
        >
          {children}
        </tr>
      ),
      th: ({ node, children, ...props }: any) => (
        <th
          className="px-3 py-1.5 text-left text-xs font-semibold text-foreground border-r border-border/30 last:border-r-0"
          {...props}
        >
          {children}
        </th>
      ),
      td: ({ node, children, ...props }: any) => (
        <td
          className="px-3 py-1.5 text-foreground border-r border-border/30 last:border-r-0"
          {...props}
        >
          {children}
        </td>
      ),
    }),
    [],
  ); // Empty deps - LinkWrapper is stable

  return (
    <div
      className={`relative my-2 group ${directionClasses} math-content-wrapper overflow-x-hidden min-w-0 break-words`}
      dir={textDirection}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
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
                `,
        }}
      />
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkBreaks,
          [remarkMath, { singleDollarTextMath: false }],
          remarkMatrxVariable,
        ]}
        rehypePlugins={[[rehypeKatex, { strict: "ignore" }]]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>

      {/* Only render interactive elements when stream is not active */}
      {!isStreamActive && isHovering && (
        <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {showCopyButton && (
            <InlineCopyButton
              markdownContent={content}
              position="top-right"
              className="mt-1 mr-1"
              isMarkdown={true}
            />
          )}
          {onEditRequest && (
            <button
              onClick={handleEdit}
              className="p-1 pt-6 text-gray-500 hover:text-gray-700 rounded-md ml-1"
              title="Edit content"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default BasicMarkdownContent;
