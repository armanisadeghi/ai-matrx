"use client";

// ─────────────────────────────────────────────────────────────────────────
// Part of the RICH DOCUMENT rendering engine (the "basement"). This is the
// themeable / configurable renderer variant (styleConfig + componentOverrides).
//
// IMPORTANT: despite the react-markdown / remark imports below, this is NOT a
// thin markdown wrapper — it is one piece of a multi-thousand-line content
// runtime. Do not "simplify" it or swap it for a plugin.
//
// FRONT DOOR: prefer `<RichDocument>` (features/rich-document/RichDocument.tsx),
// which wraps this engine and adds the action toolkit. See
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

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

// ---------------------------------------------------------------------------
// Theme / style config types
// ---------------------------------------------------------------------------

export interface MarkdownTypographyConfig {
  /** Font family class applied to paragraphs. Default: "font-sans" */
  fontFamily?: string;
  /** Base font size for LTR text. Default: "text-sm" */
  fontSizeLtr?: string;
  /** Base font size for RTL text (Arabic/Hebrew etc). Default: "text-base" */
  fontSizeRtl?: string;
  /** Letter-spacing class applied to paragraphs. Default: "tracking-wide" */
  tracking?: string;
  /** Line-height class applied to paragraphs/lists. Default: "leading-relaxed" */
  leading?: string;
}

export interface MarkdownColorConfig {
  /** Primary accent color (headings, links, code bg tint, etc.). Default: "blue" Tailwind color name */
  accent?: string;
  /** Inline code bg light. Default: "bg-blue-100" */
  codeBgLight?: string;
  /** Inline code text light. Default: "text-blue-800" */
  codeTextLight?: string;
  /** Inline code bg dark. Default: "dark:bg-blue-900/30" */
  codeBgDark?: string;
  /** Inline code text dark. Default: "dark:text-blue-300" */
  codeTextDark?: string;
  /** Blockquote border light. Default: "border-blue-200" */
  blockquoteBorderLight?: string;
  /** Blockquote border dark. Default: "dark:border-blue-700" */
  blockquoteBorderDark?: string;
  /** Blockquote bg light. Default: "bg-blue-50" */
  blockquoteBgLight?: string;
  /** Blockquote bg dark. Default: "dark:bg-blue-950/20" */
  blockquoteBgDark?: string;
  /** Blockquote text light. Default: "text-gray-700" */
  blockquoteTextLight?: string;
  /** Blockquote text dark. Default: "dark:text-gray-300" */
  blockquoteTextDark?: string;
  /** Italic (em) color outside headings, light. Default: "text-blue-600" */
  emColorLight?: string;
  /** Italic (em) color outside headings, dark. Default: "dark:text-blue-400" */
  emColorDark?: string;
  /** Heading color class. Default: "text-blue-500" */
  headingColor?: string;
  /** HR border light. Default: "border-gray-300" */
  hrBorderLight?: string;
  /** HR border dark. Default: "dark:border-gray-600" */
  hrBorderDark?: string;
  /** Checkbox border light. Default: "border-blue-400" */
  checkboxBorderLight?: string;
  /** Checkbox checked bg light. Default: "bg-blue-600" */
  checkboxCheckedBgLight?: string;
  /** Edit button text color. Default: "text-gray-500" */
  editButtonColor?: string;
  /** Edit button hover color. Default: "hover:text-gray-700" */
  editButtonHoverColor?: string;
}

export interface MarkdownSpacingConfig {
  /** Margin bottom for paragraphs. Default: "mb-2" */
  paragraphMb?: string;
  /** Margin bottom for lists. Default: "mb-3" */
  listMb?: string;
  /** Left/right padding for lists. Default: "pl-6" */
  listPl?: string;
  /** Margin bottom for list items. Default: "mb-1" */
  listItemMb?: string;
  /** Blockquote padding horizontal (LTR). Default: "pl-4" */
  blockquotePl?: string;
  /** Blockquote padding horizontal (RTL). Default: "pr-4" */
  blockquotePr?: string;
  /** Blockquote padding vertical. Default: "py-3" */
  blockquotePy?: string;
  /** Pre/code block vertical margin. Default: "my-3" */
  preMy?: string;
  /** Image vertical margin. Default: "my-4" */
  imgMy?: string;
  /** HR vertical margin. Default: "my-3" */
  hrMy?: string;
  /** Math-only paragraph margin bottom. Default: "mb-4" */
  mathParagraphMb?: string;
  /** Blank-line spacer height. Default: "h-[0.75em]" */
  blankLineHeight?: string;
  /** Wrapper top/bottom margin. Default: "my-2" */
  wrapperMy?: string;
}

export interface MarkdownHeadingConfig {
  h1?: string;
  h2?: string;
  h3?: string;
  h4?: string;
}

export interface MarkdownComponentOverrides {
  /** Fully replace the `<a>` renderer. Receives { node, href, children, ...props } */
  a?: React.ComponentType<any>;
  /** Fully replace the `<p>` renderer */
  p?: React.ComponentType<any>;
  /** Fully replace the `<strong>` renderer */
  strong?: React.ComponentType<any>;
  /** Fully replace the `<em>` renderer */
  em?: React.ComponentType<any>;
  /** Fully replace the `<blockquote>` renderer */
  blockquote?: React.ComponentType<any>;
  /** Fully replace the `<ul>` renderer */
  ul?: React.ComponentType<any>;
  /** Fully replace the `<ol>` renderer */
  ol?: React.ComponentType<any>;
  /** Fully replace the `<li>` renderer */
  li?: React.ComponentType<any>;
  /** Fully replace the `<h1>` renderer */
  h1?: React.ComponentType<any>;
  /** Fully replace the `<h2>` renderer */
  h2?: React.ComponentType<any>;
  /** Fully replace the `<h3>` renderer */
  h3?: React.ComponentType<any>;
  /** Fully replace the `<h4>` renderer */
  h4?: React.ComponentType<any>;
  /** Fully replace the `<code>` renderer */
  code?: React.ComponentType<any>;
  /** Fully replace the `<pre>` renderer */
  pre?: React.ComponentType<any>;
  /** Fully replace the `<img>` renderer */
  img?: React.ComponentType<any>;
  /** Fully replace the `<hr>` renderer */
  hr?: React.ComponentType<any>;
  /** Fully replace the `<table>` renderer (default: hidden) */
  table?: React.ComponentType<any>;
}

export interface MarkdownStyleConfig {
  typography?: MarkdownTypographyConfig;
  colors?: MarkdownColorConfig;
  spacing?: MarkdownSpacingConfig;
  headings?: MarkdownHeadingConfig;
  /** Arbitrary extra classes appended to the outer wrapper div */
  wrapperClassName?: string;
}

// ---------------------------------------------------------------------------
// Default config — mirrors BasicMarkdownContent exactly
// ---------------------------------------------------------------------------

const DEFAULT_TYPOGRAPHY: Required<MarkdownTypographyConfig> = {
  fontFamily: "font-sans",
  fontSizeLtr: "text-sm",
  fontSizeRtl: "text-base",
  tracking: "tracking-wide",
  leading: "leading-relaxed",
};

const DEFAULT_COLORS: Required<MarkdownColorConfig> = {
  accent: "blue",
  codeBgLight: "bg-blue-100",
  codeTextLight: "text-blue-800",
  codeBgDark: "dark:bg-blue-900/30",
  codeTextDark: "dark:text-blue-300",
  blockquoteBorderLight: "border-blue-200",
  blockquoteBorderDark: "dark:border-blue-700",
  blockquoteBgLight: "bg-blue-50",
  blockquoteBgDark: "dark:bg-blue-950/20",
  blockquoteTextLight: "text-gray-700",
  blockquoteTextDark: "dark:text-gray-300",
  emColorLight: "text-blue-600",
  emColorDark: "dark:text-blue-400",
  headingColor: "text-blue-500",
  hrBorderLight: "border-gray-300",
  hrBorderDark: "dark:border-gray-600",
  checkboxBorderLight: "border-blue-400",
  checkboxCheckedBgLight: "bg-blue-600",
  editButtonColor: "text-gray-500",
  editButtonHoverColor: "hover:text-gray-700",
};

const DEFAULT_SPACING: Required<MarkdownSpacingConfig> = {
  paragraphMb: "mb-2",
  listMb: "mb-3",
  listPl: "pl-6",
  listItemMb: "mb-1",
  blockquotePl: "pl-4",
  blockquotePr: "pr-4",
  blockquotePy: "py-3",
  preMy: "my-3",
  imgMy: "my-4",
  hrMy: "my-3",
  mathParagraphMb: "mb-4",
  blankLineHeight: "h-[0.75em]",
  wrapperMy: "my-2",
};

const DEFAULT_HEADINGS: Required<MarkdownHeadingConfig> = {
  h1: "text-2xl font-bold pt-2 mb-1 font-heading",
  h2: "text-xl font-medium pt-1 mb-1 font-heading",
  h3: "text-lg font-medium pt-1 mb-2 font-heading",
  h4: "text-lg pt-2 font-medium mb-1 mt-3 font-heading",
};

// ---------------------------------------------------------------------------
// Utility: merge partial config with defaults
// ---------------------------------------------------------------------------

function resolveConfig(partial?: MarkdownStyleConfig): {
  typography: Required<MarkdownTypographyConfig>;
  colors: Required<MarkdownColorConfig>;
  spacing: Required<MarkdownSpacingConfig>;
  headings: Required<MarkdownHeadingConfig>;
  wrapperClassName: string;
} {
  return {
    typography: { ...DEFAULT_TYPOGRAPHY, ...partial?.typography },
    colors: { ...DEFAULT_COLORS, ...partial?.colors },
    spacing: { ...DEFAULT_SPACING, ...partial?.spacing },
    headings: { ...DEFAULT_HEADINGS, ...partial?.headings },
    wrapperClassName: partial?.wrapperClassName ?? "",
  };
}

// ---------------------------------------------------------------------------
// RTL detection helpers (unchanged from BasicMarkdownContent)
// ---------------------------------------------------------------------------

const detectTextDirection = (text: string): "rtl" | "ltr" => {
  const rtlRanges = [
    /[\u0590-\u05FF]/,
    /[\u0600-\u06FF]/,
    /[\u0750-\u077F]/,
    /[\u08A0-\u08FF]/,
    /[\uFB50-\uFDFF]/,
    /[\uFE70-\uFEFF]/,
    /[\u200F]/,
    /[\u202E]/,
  ];

  let rtlCount = 0;
  let ltrCount = 0;

  for (const char of text) {
    if (rtlRanges.some((range) => range.test(char))) {
      rtlCount++;
    } else if (/[a-zA-Z]/.test(char)) {
      ltrCount++;
    }
  }

  const totalAlphabetic = rtlCount + ltrCount;
  if (totalAlphabetic === 0) return "ltr";
  return rtlCount / totalAlphabetic > 0.1 ? "rtl" : "ltr";
};

const getDirectionClasses = (direction: "rtl" | "ltr") =>
  direction === "rtl" ? "text-right rtl" : "text-left ltr";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ConfigurableMarkdownContentProps {
  content: string;
  isStreamActive?: boolean;
  onEditRequest?: () => void;
  messageId?: string;
  showCopyButton?: boolean;
  /** Style/theme overrides. Anything not provided falls back to defaults. */
  styleConfig?: MarkdownStyleConfig;
  /** Per-element renderer overrides. Fully replaces the built-in renderer for that element. */
  componentOverrides?: MarkdownComponentOverrides;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ConfigurableMarkdownContent: React.FC<
  ConfigurableMarkdownContentProps
> = ({
  content,
  isStreamActive,
  onEditRequest,
  messageId,
  showCopyButton = true,
  styleConfig,
  componentOverrides,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  const { typography, colors, spacing, headings, wrapperClassName } = useMemo(
    () => resolveConfig(styleConfig),
    [styleConfig],
  );

  const textDirection = useMemo(() => detectTextDirection(content), [content]);
  const directionClasses = getDirectionClasses(textDirection);

  // Derive font size helper from config
  const getFontSize = (direction: "rtl" | "ltr") =>
    direction === "rtl" ? typography.fontSizeRtl : typography.fontSizeLtr;

  // ---------------------------------------------------------------------------
  // Link wrapper — stable, respects componentOverrides.a
  // ---------------------------------------------------------------------------
  const LinkWrapper = useMemo(() => {
    if (componentOverrides?.a) return componentOverrides.a;
    return ({ node, href, children, ...props }: any) => (
      <LinkComponent href={href}>{children}</LinkComponent>
    );
  }, [componentOverrides?.a]);

  // ---------------------------------------------------------------------------
  // preprocessContent — identical regex logic, untouched
  // ---------------------------------------------------------------------------
  const preprocessContent = (rawContent: string): string => {
    let processed = rawContent;

    processed = processed.replace(/<(\/?[\w][\w-]*)([^>]*?)>/g, "&lt;$1$2&gt;");

    processed = processed.replace(/^( +)/gm, (spaces) =>
      "\u00A0\u00A0".repeat(spaces.length),
    );

    processed = processed.replace(
      /\[(https?:\/\/[^\]\s]+)\](?!\()/g,
      "[$1]($1)",
    );

    processed = processed.replace(
      /\\\[([\s\S]*?)\\\]/g,
      (match, mathContent) => `\n\n$$${mathContent}$$\n\n`,
    );

    processed = processed.replace(
      /\\\((.*?)\\\)/g,
      (match, mathContent) => `\n\n$$${mathContent}$$\n\n`,
    );

    processed = processed.replace(
      /\[[\s\n]*([\s\S]*?)[\s\n]*\](?!\()/g,
      (match, content) => {
        const trimmedContent = content.trim();

        if (
          content.includes("\\") &&
          (content.includes("\n") || content.length >= 3)
        ) {
          return `\n\n$$${content}$$\n\n`;
        }

        const isMultilineBrackets =
          match.startsWith("[\n") || match.startsWith("[ \n");
        if (isMultilineBrackets && trimmedContent.length >= 3) {
          const hasMathOperators = /[+\-=×÷*/]/.test(trimmedContent);
          const hasProseWords =
            /\b(note|step|example|optional|the|is|are|was|were|for|with|this|that)\b/i.test(
              trimmedContent,
            );
          const mathLikeRatio =
            (trimmedContent.match(/[0-9+\-=×÷*/()xy\s]/g) || []).length /
            trimmedContent.length;

          if (hasMathOperators && !hasProseWords && mathLikeRatio > 0.6) {
            return `\n\n$$${content}$$\n\n`;
          }
        }

        return match;
      },
    );

    processed = processed.replace(/^(\s*)\*([ \t]+)/gm, "$1-$2");

    processed = processed.replace(
      /(^[ \t]*-[ \t]+[^\n]+)\n\n(\*\*\d)/gm,
      "$1\n\n<!-- -->\n$2",
    );

    processed = processed.replace(/([^\n])\n---/g, "$1\n\n---");

    processed = processed.replace(/(\*\*[^*]+\*\*)\n([^\n*\-])/g, "$1\n\n$2");

    processed = processed.replace(
      /([^\n])\n(\*[^*]+\*)\n([^\n])/g,
      "$1\n\n$2\n\n$3",
    );

    processed = processed.replace(
      /(\*\*[^*]+\*\*|\*[^*]+\*)\n([^\n*\s\-])/g,
      "$1\n\n$2",
    );

    processed = processed.replace(
      /(^|\n)(\s+[*-] .+)\n(?!\s*[*-]\s)([^\n\s\-#\d][^\n]*)/gm,
      "$1$2\n\n$3",
    );

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

    processed = processed.replace(/\n{2,}/g, (match) => {
      const blankLines = Math.min(match.length - 1, 2);
      return "\n\n" + "&nbsp;\n\n".repeat(blankLines);
    });

    return processed;
  };

  const processedContent = preprocessContent(content);

  const handleEdit = () => onEditRequest?.();

  const handleMouseEnter = !isStreamActive
    ? () => setIsHovering(true)
    : undefined;
  const handleMouseLeave = !isStreamActive
    ? () => setIsHovering(false)
    : undefined;

  // ---------------------------------------------------------------------------
  // Build configurable components map
  // ---------------------------------------------------------------------------
  const components = useMemo(
    () => {
      // Helper: extract plain text from React children (used for direction detection)
      const extractText = (children: any): string => {
        if (typeof children === "string") return children;
        if (Array.isArray(children)) return children.map(extractText).join("");
        if (children && typeof children === "object" && children.props) {
          return extractText(children.props.children);
        }
        return "";
      };

      return {
        // ---- input (checkbox) ----
        input: ({ node, type, checked, disabled, ...props }: any) => {
          if (type === "checkbox") {
            return (
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                className={cn(
                  "mr-2 h-4 w-4 rounded border-2 cursor-pointer transition-colors",
                  "focus:ring-2 focus:ring-offset-0",
                  "bg-white dark:bg-gray-800",
                  colors.checkboxBorderLight,
                  `dark:${colors.checkboxBorderLight.replace("border-", "border-")}`,
                  `text-${colors.accent}-600 dark:text-${colors.accent}-400`,
                  `checked:${colors.checkboxCheckedBgLight} dark:checked:${colors.checkboxCheckedBgLight}`,
                  `checked:${colors.checkboxBorderLight} dark:checked:${colors.checkboxBorderLight}`,
                  `focus:ring-${colors.accent}-500 dark:focus:ring-${colors.accent}-400`,
                )}
                {...props}
              />
            );
          }
          return <input type={type} {...props} />;
        },

        // ---- p ----
        p:
          componentOverrides?.p ??
          (({ node, children, ...props }: any) => {
            const childArray = React.Children.toArray(children);

            if (childArray.length === 1 && childArray[0] === "\u00A0") {
              return <div className={spacing.blankLineHeight} />;
            }

            let isMathOnly = false;
            if (childArray.length === 1) {
              const child = childArray[0] as any;
              if (
                child &&
                typeof child === "object" &&
                child.props?.className
              ) {
                isMathOnly = child.props.className.includes("katex");
              }
            }

            const paragraphText = extractText(children);
            const paragraphDirection = detectTextDirection(paragraphText);
            const paragraphDirClasses = getDirectionClasses(paragraphDirection);

            if (isMathOnly) {
              return (
                <p
                  className={cn(
                    typography.fontFamily,
                    typography.tracking,
                    typography.leading,
                    "text-base text-center",
                    spacing.mathParagraphMb,
                  )}
                  {...props}
                >
                  {children}
                </p>
              );
            }

            return (
              <p
                className={cn(
                  typography.fontFamily,
                  typography.tracking,
                  typography.leading,
                  getFontSize(paragraphDirection),
                  spacing.paragraphMb,
                  "pl-0 ml-0",
                  paragraphDirClasses,
                )}
                dir={paragraphDirection}
                {...props}
              >
                {children}
              </p>
            );
          }),

        // ---- strong ----
        strong:
          componentOverrides?.strong ??
          (({ node, children, ...props }: any) => {
            const parentTagName = node.parent?.tagName?.toLowerCase() || "";
            const isInHeading = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(
              parentTagName,
            );
            const boldText = extractText(children);
            const boldDirection = detectTextDirection(boldText);

            return (
              <strong
                className={cn(
                  isInHeading ? "" : "font-extrabold",
                  getDirectionClasses(boldDirection),
                )}
                dir={boldDirection}
                {...props}
              >
                {children}
              </strong>
            );
          }),

        // ---- em ----
        em:
          componentOverrides?.em ??
          (({ node, children, ...props }: any) => {
            const parentTagName = node.parent?.tagName?.toLowerCase() || "";
            const isInHeading = ["h1", "h2", "h3", "h4", "h5", "h6"].includes(
              parentTagName,
            );
            const italicText = extractText(children);
            const italicDirection = detectTextDirection(italicText);

            return (
              <em
                className={cn(
                  "italic",
                  isInHeading
                    ? ""
                    : cn(colors.emColorLight, colors.emColorDark),
                  getDirectionClasses(italicDirection),
                )}
                dir={italicDirection}
                {...props}
              >
                {children}
              </em>
            );
          }),

        // ---- blockquote ----
        blockquote:
          componentOverrides?.blockquote ??
          (({ node, children, ...props }: any) => {
            const blockquoteText = extractText(children);
            const blockquoteDirection = detectTextDirection(blockquoteText);
            const isRtl = blockquoteDirection === "rtl";

            return (
              <blockquote
                className={cn(
                  isRtl
                    ? cn(spacing.blockquotePr, "border-r-4")
                    : cn(spacing.blockquotePl, "border-l-4"),
                  spacing.blockquotePy,
                  colors.blockquoteBorderLight,
                  colors.blockquoteBorderDark,
                  "italic",
                  colors.blockquoteTextLight,
                  colors.blockquoteTextDark,
                  colors.blockquoteBgLight,
                  colors.blockquoteBgDark,
                  getDirectionClasses(blockquoteDirection),
                )}
                dir={blockquoteDirection}
                {...props}
              >
                {children}
              </blockquote>
            );
          }),

        // ---- ul ----
        ul:
          componentOverrides?.ul ??
          (({ node, children, ...props }: any) => {
            const listText = extractText(children);
            const listDirection = detectTextDirection(listText);

            return (
              <ul
                className={cn(
                  // L1 disc, L2 hollow circle, L3+ dash (depth cascade).
                  "list-disc [&_ul]:list-[circle] [&_ul_ul]:list-dash",
                  spacing.listMb,
                  typography.leading,
                  getFontSize(listDirection),
                  spacing.listPl,
                  getDirectionClasses(listDirection),
                )}
                dir={listDirection}
                {...props}
              >
                {children}
              </ul>
            );
          }),

        // ---- ol ----
        ol:
          componentOverrides?.ol ??
          (({ node, children, ...props }: any) => {
            const listText = extractText(children);
            const listDirection = detectTextDirection(listText);

            return (
              <ol
                className={cn(
                  // L1 decimal, L2 lower-roman, L3+ lower-alpha (depth cascade).
                  "list-decimal [&_ol]:list-[lower-roman] [&_ol_ol]:list-[lower-alpha]",
                  spacing.listMb,
                  typography.leading,
                  getFontSize(listDirection),
                  spacing.listPl,
                  getDirectionClasses(listDirection),
                )}
                dir={listDirection}
                {...props}
              >
                {children}
              </ol>
            );
          }),

        // ---- li ----
        li:
          componentOverrides?.li ??
          (({ node, children, ...props }: any) => {
            const itemText = extractText(children);
            const itemDirection = detectTextDirection(itemText);
            const isTaskItem =
              node?.properties?.className?.includes("task-list-item");

            if (isTaskItem) {
              return (
                <li
                  className={cn(
                    spacing.listItemMb,
                    "flex items-center",
                    getFontSize(itemDirection),
                    getDirectionClasses(itemDirection),
                  )}
                  dir={itemDirection}
                >
                  {children}
                </li>
              );
            }

            return (
              <li
                className={cn(
                  spacing.listItemMb,
                  getFontSize(itemDirection),
                  getDirectionClasses(itemDirection),
                )}
                dir={itemDirection}
              >
                {children}
              </li>
            );
          }),

        // ---- link ----
        a: LinkWrapper,

        // ---- headings ----
        h1:
          componentOverrides?.h1 ??
          (({ node, children, ...props }: any) => {
            const headingText = extractText(children);
            const headingDirection = detectTextDirection(headingText);
            return (
              <h1
                className={cn(
                  headings.h1,
                  colors.headingColor,
                  getDirectionClasses(headingDirection),
                )}
                dir={headingDirection}
                {...props}
              >
                {children}
              </h1>
            );
          }),

        h2:
          componentOverrides?.h2 ??
          (({ node, children, ...props }: any) => {
            const headingText = extractText(children);
            const headingDirection = detectTextDirection(headingText);
            return (
              <h2
                className={cn(
                  headings.h2,
                  colors.headingColor,
                  getDirectionClasses(headingDirection),
                )}
                dir={headingDirection}
                {...props}
              >
                {children}
              </h2>
            );
          }),

        h3:
          componentOverrides?.h3 ??
          (({ node, children, ...props }: any) => {
            const headingText = extractText(children);
            const headingDirection = detectTextDirection(headingText);
            return (
              <h3
                className={cn(
                  headings.h3,
                  colors.headingColor,
                  getDirectionClasses(headingDirection),
                )}
                dir={headingDirection}
                {...props}
              >
                {children}
              </h3>
            );
          }),

        h4:
          componentOverrides?.h4 ??
          (({ node, children, ...props }: any) => {
            const headingText = extractText(children);
            const headingDirection = detectTextDirection(headingText);
            return (
              <h4
                className={cn(
                  headings.h4,
                  colors.headingColor,
                  getDirectionClasses(headingDirection),
                )}
                dir={headingDirection}
                {...props}
              >
                {children}
              </h4>
            );
          }),

        // ---- pre ----
        pre:
          componentOverrides?.pre ??
          (({ node, children, ...props }: any) => (
            <pre className={spacing.preMy} {...props}>
              {children}
            </pre>
          )),

        // ---- code (inline only) ----
        code:
          componentOverrides?.code ??
          (({ node, inline, className, children, ...props }: any) => {
            const isCodeBlock =
              Array.isArray(children) &&
              children.length === 1 &&
              typeof children[0] === "string" &&
              children[0] === "pygame";

            if (!isCodeBlock && (inline === true || inline === undefined)) {
              return (
                <code
                  className={cn(
                    "px-1.5 py-0 rounded font-mono text-sm font-medium",
                    colors.codeBgLight,
                    colors.codeTextLight,
                    colors.codeBgDark,
                    colors.codeTextDark,
                    className,
                  )}
                  style={{ overflowWrap: "anywhere", wordBreak: "normal" }}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return null;
          }),

        // ---- img ----
        img:
          componentOverrides?.img ??
          (({ node, ...props }: any) => (
            <img
              className={cn("max-w-full h-auto rounded-md", spacing.imgMy)}
              {...props}
              alt={props.alt || "Image"}
            />
          )),

        // ---- hr ----
        hr:
          componentOverrides?.hr ??
          (({ node, ...props }: any) => (
            <hr
              className={cn(
                spacing.hrMy,
                "border-t",
                colors.hrBorderLight,
                colors.hrBorderDark,
              )}
              {...props}
            />
          )),

        // ---- br ----
        br: ({ node, ...props }: any) => <br />,

        // ---- div / span (pass-through) ----
        div: ({ node, className, children, ...props }: any) => (
          <div className={className} {...props}>
            {children}
          </div>
        ),
        span: ({ node, className, children, ...props }: any) => (
          <span className={className} {...props}>
            {children}
          </span>
        ),

        // ---- tables (hidden by default, overridable) ----
        table: componentOverrides?.table ?? (() => null),
        thead: () => null,
        tbody: () => null,
        tr: () => null,
        th: () => null,
        td: () => null,
      };
    },
    // Re-derive when config or overrides change
    [typography, colors, spacing, headings, componentOverrides, LinkWrapper],
  );

  // ---------------------------------------------------------------------------
  // Dynamic CSS — keep class names in sync with config
  // ---------------------------------------------------------------------------
  const dynamicStyles = `
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
    .math-content-wrapper pre:has(> code.${colors.codeBgLight
      .replace("bg-", "")
      .replace("/", "\\/")
      .replace("[", "\\[")
      .replace("]", "\\]")}) {
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: anywhere;
        font-family: inherit;
        background: transparent;
        padding: 0;
        margin: 0;
    }
    .math-content-wrapper pre:has(> code.${colors.codeBgLight
      .replace("bg-", "")
      .replace("/", "\\/")
      .replace("[", "\\[")
      .replace("]", "\\]")}) > code {
        white-space: normal;
        display: inline;
        overflow-wrap: anywhere;
        word-break: normal;
    }
  `;

  return (
    <div
      className={cn(
        "relative group math-content-wrapper overflow-x-hidden min-w-0 break-words",
        spacing.wrapperMy,
        directionClasses,
        wrapperClassName,
      )}
      dir={textDirection}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkBreaks,
          [remarkMath, { singleDollarTextMath: false }],
        ]}
        rehypePlugins={[[rehypeKatex, { strict: "ignore" }]]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>

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
              className={cn(
                "p-1 pt-6 rounded-md ml-1",
                colors.editButtonColor,
                colors.editButtonHoverColor,
              )}
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

export default ConfigurableMarkdownContent;
