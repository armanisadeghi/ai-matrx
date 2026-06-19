/**
 * Utility functions for HTML preview and processing
 * Extracted from useHtmlPreviewState to keep the hook focused on state management
 */

import { removeThinkingContent } from "@/components/matrx/buttons/markdown-copy-utils";
import { markdownToWordPressHTML } from "./markdown-wordpress-utils";

/**
 * Detect whether a string is a complete, standalone HTML document — i.e. it has
 * a `<!DOCTYPE html>` plus matching `<html>`, `<head>`, and `<body>` tags. This
 * is the single source of truth for "is this HTML worth converting into a real,
 * previewable webpage?" Used by both the manual CodeBlock "Preview" affordance
 * and the inline auto-preview renderer. Fragments (loose `<div>`s, partial
 * markup) intentionally return false — they render as a plain code block.
 *
 * Note: caller is responsible for gating on language (e.g. lang === "html").
 */
export function isCompleteHtmlDocument(code: string): boolean {
  if (!code) return false;
  const trimmed = code.trim();
  const hasDoctype = /^\s*<!DOCTYPE\s+html/i.test(trimmed);
  const hasHtmlTag = /<html[^>]*>/i.test(trimmed) && /<\/html>/i.test(trimmed);
  const hasHead = /<head[^>]*>/i.test(trimmed) && /<\/head>/i.test(trimmed);
  const hasBody = /<body[^>]*>/i.test(trimmed) && /<\/body>/i.test(trimmed);
  return hasDoctype && hasHtmlTag && hasHead && hasBody;
}

/** Hosts we treat as embeddable media (single-iframe → seamless preview). */
const MEDIA_IFRAME_HOSTS =
  /youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|player\.vimeo|dailymotion\.com|loom\.com|wistia\.|spotify\.com|soundcloud\.com|tiktok\.com/i;

export interface HtmlEmbedInfo {
  width?: number;
  height?: number;
  /** width / height, when both are known on the embed. */
  aspectRatio?: number;
}

export interface HtmlPreviewAnalysis {
  /** Should this content auto-render as a live preview at all? */
  previewable: boolean;
  /** Is it a complete `<!DOCTYPE html>` document? */
  isDocument: boolean;
  /** Is it (essentially) a single media embed → render seamlessly. */
  isMediaEmbed: boolean;
  /** HTML to publish — fragments are wrapped into a minimal responsive doc. */
  html: string;
  /** Sizing hint for a dominant media embed. */
  embed?: HtmlEmbedInfo;
}

/** Wrap a bare media fragment (e.g. a YouTube `<iframe>`) into a minimal doc. */
function wrapFragmentAsMediaDocument(fragment: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden}iframe,video{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
<body>${fragment}</body></html>`;
}

/**
 * Decide whether/how to auto-preview an HTML code block, and how to size it.
 *
 * Two things qualify for an inline preview:
 *  - A complete HTML document (DOCTYPE + html/head/body).
 *  - A single recognized media embed (one `<iframe>` to YouTube/Vimeo/etc., or a
 *    lone `<video>`), even as a fragment — these get the seamless treatment so a
 *    video sits in the content without a giant wrapper.
 *
 * Everything else (loose markup, multi-element fragments) stays a code block —
 * that's why partial snippets "don't get picked up" by default.
 */
export function analyzeHtmlForPreview(code: string): HtmlPreviewAnalysis {
  const trimmed = (code || "").trim();
  const isDocument = isCompleteHtmlDocument(trimmed);

  const iframeTags = trimmed.match(/<iframe\b[^>]*>/gi) || [];
  const videoTags = trimmed.match(/<video\b[^>]*>/gi) || [];
  const mediaIframes = iframeTags.filter((t) => MEDIA_IFRAME_HOSTS.test(t));

  let isMediaEmbed = false;
  let embed: HtmlEmbedInfo | undefined;

  // Exactly one media iframe (and nothing competing with it) → media embed.
  if (
    iframeTags.length === 1 &&
    mediaIframes.length === 1 &&
    videoTags.length === 0
  ) {
    isMediaEmbed = true;
    const tag = mediaIframes[0];
    const w = Number(tag.match(/width=["']?(\d+)/i)?.[1]);
    const h = Number(tag.match(/height=["']?(\d+)/i)?.[1]);
    embed = {
      width: Number.isFinite(w) ? w : undefined,
      height: Number.isFinite(h) ? h : undefined,
      aspectRatio:
        Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : undefined,
    };
  } else if (iframeTags.length === 0 && videoTags.length === 1) {
    isMediaEmbed = true; // lone <video>
  }

  const previewable = isDocument || isMediaEmbed;
  const html =
    !isDocument && isMediaEmbed
      ? wrapFragmentAsMediaDocument(trimmed)
      : trimmed;

  return { previewable, isDocument, isMediaEmbed, html, embed };
}

/**
 * Simple conversion: markdown -> clean HTML
 */
export function convertMarkdownToHtml(markdown: string): string {
  const cleanedMarkdown = removeThinkingContent(markdown);
  return markdownToWordPressHTML(cleanedMarkdown);
}

/**
 * Determine which HTML to use for publishing based on edit state
 */
export function prepareHtmlForPublish(params: {
  isMarkdownDirty: boolean;
  isHtmlDirty: boolean;
  currentMarkdown: string;
  editedCompleteHtml: string;
  generatedHtmlContent: string;
}): {
  bodyHtml: string;
  completeHtmlToPublish?: string;
  newlyGeneratedHtml?: string;
} {
  const {
    isMarkdownDirty,
    isHtmlDirty,
    currentMarkdown,
    editedCompleteHtml,
    generatedHtmlContent,
  } = params;

  // Case 1: Markdown was edited -> regenerate from markdown
  if (isMarkdownDirty || !editedCompleteHtml) {
    const newHtml = convertMarkdownToHtml(currentMarkdown);
    return {
      bodyHtml: newHtml,
      newlyGeneratedHtml: newHtml,
    };
  }

  // Case 2: HTML was directly edited -> use edited HTML
  if (isHtmlDirty && editedCompleteHtml) {
    return {
      bodyHtml: extractBodyContent(editedCompleteHtml, generatedHtmlContent),
      completeHtmlToPublish: editedCompleteHtml,
    };
  }

  // Case 3: No changes -> use current generated HTML
  return {
    bodyHtml: generatedHtmlContent,
  };
}

/**
 * Prepare metadata for publishing
 */
export function prepareMetadataForPublish(params: {
  useMetadata: boolean;
  bodyHtml: string;
  pageTitle: string;
  pageDescription: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogImage: string;
  canonicalUrl: string;
}): {
  title: string;
  description: string;
  metaFields: Record<string, any>;
} {
  const extractedTitle = extractTitleFromHTML(params.bodyHtml);

  if (params.useMetadata) {
    const title =
      params.pageTitle.trim() || extractedTitle || "Generated Content";
    const description = params.pageDescription.trim() || "";

    return {
      title,
      description,
      metaFields: {
        metaTitle: params.metaTitle.trim() || title,
        metaDescription: params.metaDescription.trim() || description,
        metaKeywords: params.metaKeywords.trim() || null,
        ogImage: params.ogImage.trim() || null,
        canonicalUrl: params.canonicalUrl.trim() || null,
      },
    };
  }

  // No metadata - just use extracted values
  return {
    title: extractedTitle || "Generated Content",
    description: "",
    metaFields: {},
  };
}

/**
 * Extract the title from HTML content by finding the first h1 or h2
 */
export function extractTitleFromHTML(htmlContent: string): string {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;

    const h1 = tempDiv.querySelector("h1");
    if (h1 && h1.textContent?.trim()) {
      return h1.textContent.trim();
    }

    const h2 = tempDiv.querySelector("h2");
    if (h2 && h2.textContent?.trim()) {
      return h2.textContent.trim();
    }

    return "";
  } catch (error) {
    console.error("Error extracting title from HTML:", error);
    return "";
  }
}

/**
 * Extract a description from HTML content by finding the first paragraph after a heading
 */
export function extractDescriptionFromHTML(htmlContent: string): string {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;

    let firstHeading = tempDiv.querySelector("h1");
    if (!firstHeading) {
      firstHeading = tempDiv.querySelector("h2");
    }

    if (firstHeading) {
      let nextElement = firstHeading.nextElementSibling;
      while (nextElement) {
        if (nextElement.tagName === "P" && nextElement.textContent?.trim()) {
          const fullText = nextElement.textContent.trim();
          const firstSentence = fullText.split(/[.!?]/)[0];
          return (
            firstSentence.trim() +
            (firstSentence.length < fullText.length ? "." : "")
          );
        }
        nextElement = nextElement.nextElementSibling;
      }
    } else {
      const firstP = tempDiv.querySelector("p");
      if (firstP && firstP.textContent?.trim()) {
        const fullText = firstP.textContent.trim();
        const firstSentence = fullText.split(/[.!?]/)[0];
        return (
          firstSentence.trim() +
          (firstSentence.length < fullText.length ? "." : "")
        );
      }
    }

    return "";
  } catch (error) {
    console.error("Error extracting description from HTML:", error);
    return "";
  }
}

/**
 * Extract body content from a complete HTML document
 */
export function extractBodyContent(
  completeHtml: string,
  fallbackContent: string = "",
): string {
  const match = completeHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : fallbackContent;
}

/**
 * Remove bullet style classes from HTML
 */
export function stripBulletStyles(html: string): string {
  return html.replace(/class="matrx-list-item"/g, "");
}

/**
 * Remove decorative line breaks from HTML
 */
export function stripDecorativeLineBreaks(html: string): string {
  return html.replace(/<hr class="matrx-hr"[^>]*>/g, "");
}

/**
 * Apply custom HTML processing options
 */
export function applyCustomOptions(
  html: string,
  options: {
    includeBulletStyles?: boolean;
    includeDecorativeLineBreaks?: boolean;
  },
): string {
  let processedHtml = html;

  if (options.includeBulletStyles === false) {
    processedHtml = stripBulletStyles(processedHtml);
  }

  if (options.includeDecorativeLineBreaks === false) {
    processedHtml = stripDecorativeLineBreaks(processedHtml);
  }

  return processedHtml;
}

/**
 * Generate a complete HTML document with CSS
 */
export function generateCompleteHTML(params: {
  bodyContent: string;
  css: string;
  title?: string;
}): string {
  const pageTitle =
    params.title ||
    extractTitleFromHTML(params.bodyContent) ||
    "WordPress Content";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <style>
${params.css}
    </style>
</head>
<body>
    ${params.bodyContent}
</body>
</html>`;
}

/**
 * SEO character count status
 */
export interface CharacterCountStatus {
  status: "empty" | "good" | "warning" | "error";
  color: string;
}

/**
 * Get character count status for SEO fields
 */
export function getCharacterCountStatus(
  text: string,
  ideal: number,
  max: number,
): CharacterCountStatus {
  const length = text.length;
  if (length === 0) return { status: "empty", color: "text-gray-400" };
  if (length <= ideal)
    return { status: "good", color: "text-green-600 dark:text-green-400" };
  if (length <= max)
    return { status: "warning", color: "text-yellow-600 dark:text-yellow-400" };
  return { status: "error", color: "text-red-600 dark:text-red-400" };
}

/**
 * Get SEO recommendation for a field
 */
export function getSEORecommendation(text: string, field: string): string {
  const length = text.length;
  switch (field) {
    case "title":
      if (length === 0) return "Page title is required";
      if (length < 30) return "Consider a longer, more descriptive title";
      if (length > 60) return "Title may be truncated in search results";
      return "Good title length";
    case "description":
      if (length === 0) return "Description helps with SEO";
      if (length < 120) return "Consider a longer description";
      if (length > 160) return "Description may be truncated";
      return "Good description length";
    case "metaTitle":
      if (length === 0) return "Will use page title if empty";
      if (length < 30) return "Consider a longer meta title";
      if (length > 60) return "Meta title may be truncated";
      return "Good meta title length";
    case "metaDescription":
      if (length === 0) return "Will use page description if empty";
      if (length < 120) return "Consider a longer meta description";
      if (length > 160) return "Meta description may be truncated";
      return "Good meta description length";
    default:
      return "";
  }
}
