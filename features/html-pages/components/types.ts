/**
 * Types for HTML Preview components
 *
 * SOURCE FILES ARCHITECTURE:
 * All state is organized around source files that combine to create complete.html
 */

import type { HtmlMetadata } from "@/features/html-pages/utils/html-source-files-utils";

export interface HtmlPreviewState {
  // Copy states
  copied: boolean;
  copiedNoBullets: boolean;
  copiedCSS: boolean;
  copiedComplete: boolean;
  copiedCustom: boolean;
  copiedUrl: boolean;

  // Markdown content (initial source, can be edited)
  initialMarkdown: string;
  currentMarkdown: string;

  // SOURCE FILES - SINGLE SOURCE OF TRUTH
  contentHtml: string; // Body content only (editable)
  wordPressCSS: string; // CSS rules (editable)
  metadata: HtmlMetadata; // SEO and meta information (editable)
  scripts?: string; // LD+JSON and other scripts (future, editable)

  // Source of truth tracking
  isMarkdownDirty: boolean; // True when markdown is edited
  isContentDirty: boolean; // True when content.html is directly edited

  // Custom copy options
  includeBulletStyles: boolean;
  includeDecorativeLineBreaks: boolean;

  // Save page states
  savedPage: any;
  publishedPageUrl: string | null; // Single URL for the published page
  showAdvancedMeta: boolean;

  // HTML Pages system
  isCreating: boolean;
  error: string | null;
}

export interface HtmlPreviewActions {
  // Copy state setters
  setCopied: (value: boolean) => void;
  setCopiedNoBullets: (value: boolean) => void;
  setCopiedCSS: (value: boolean) => void;
  setCopiedComplete: (value: boolean) => void;
  setCopiedCustom: (value: boolean) => void;
  setCopiedUrl: (value: boolean) => void;

  // Markdown content setters
  setCurrentMarkdown: (value: string) => void;

  // SOURCE FILES setters
  setContentHtml: (value: string) => void;
  setWordPressCSS: (value: string) => void;
  setMetadata: (value: HtmlMetadata) => void;
  setMetadataFromJson: (json: string) => void;
  setMetadataField: <K extends keyof HtmlMetadata>(
    field: K,
    value: HtmlMetadata[K],
  ) => void;

  // Custom copy options setters
  setIncludeBulletStyles: (value: boolean) => void;
  setIncludeDecorativeLineBreaks: (value: boolean) => void;

  // Save page setters
  setSavedPage: (value: any) => void;
  setPublishedPageUrl: (value: string | null) => void;
  setShowAdvancedMeta: (value: boolean) => void;

  // Actions
  handleCopyHtml: () => Promise<void>;
  handleCopyHtmlNoBullets: () => Promise<void>;
  handleCopyCSS: () => Promise<void>;
  handleCopyComplete: () => Promise<void>;
  handleCopyCustom: () => Promise<void>;
  handleCopyUrl: (url: string) => Promise<void>;
  handleSavePage: () => Promise<void>;
  handleRegenerateHtml: (useMetadata?: boolean) => Promise<void>;
  handleRefreshMarkdown: () => void;
  handleUpdateFromMarkdown: () => void; // NEW: Regenerate source files from markdown
  extractMetadataFromContent: () => void; // NEW: Extract metadata from content.html

  // Utility functions
  generateCompleteHtmlFromSources: () => string; // NEW: Generate from source files
  getCurrentPreviewUrl: () => string | null;
  extractBodyContent: (completeHtml: string) => string;
  stripBulletStyles: (html: string) => string;
  stripDecorativeLineBreaks: (html: string) => string;
  applyCustomOptions: (html: string) => string;
  extractTitleFromHTML: (htmlContent: string) => string;
  extractDescriptionFromHTML: (htmlContent: string) => string;
  getCharacterCountStatus: (
    text: string,
    field: "title" | "description",
  ) => { status: string; color: string };
  getSEORecommendation: (
    text: string,
    field: "title" | "description" | "metaTitle" | "metaDescription",
  ) => string;

  // Error handling
  clearError: () => void;
}

export interface HtmlPreviewHookProps {
  markdownContent: string;
  htmlContent?: string;
  user: any;
  isOpen?: boolean;
  publishedPageId?: string | null; // ID of the published page (persists across edits)
  onPageIdChange?: (pageId: string) => void; // Callback when page ID is created
  resetKey?: number; // Optional key to trigger complete state reset (e.g., for new tasks)
}

export interface HtmlPreviewTabProps {
  state: HtmlPreviewState;
  actions: HtmlPreviewActions;
  user?: any;
}

export interface MarkdownTabProps {
  state: HtmlPreviewState;
  actions: HtmlPreviewActions;
  activeTab?: string;
  analysisData?: any;
  messageId?: string;
}
