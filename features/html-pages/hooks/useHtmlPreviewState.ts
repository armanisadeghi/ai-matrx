"use client";

import { useState, useEffect, useCallback } from "react";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import {
    getMarkdownStylesheet,
    markdownToHtml,
    removeThinkingContent,
} from "@ai-matrx/print/markdown";
import { useHTMLPages } from "@/features/html-pages/hooks/useHTMLPages";
import {
    generateCompleteHtmlFromSources,
    extractMetadataFromContent as extractMetadataUtil,
    createEmptyMetadata,
    formatMetadataAsJson,
    parseJsonToMetadata,
    type HtmlMetadata,
} from "@/features/html-pages/utils/html-source-files-utils";
import {
    extractBodyContent,
    stripBulletStyles,
    stripDecorativeLineBreaks,
    applyCustomOptions,
    getCharacterCountStatus,
    getSEORecommendation,
} from "@/features/html-pages/utils/html-preview-utils";
import type { HtmlPreviewState, HtmlPreviewActions, HtmlPreviewHookProps } from "../components/types";

/**
 * HTML Preview State Hook - SOURCE FILES ARCHITECTURE
 * 
 * All HTML is derived from three source files:
 * - contentHtml: Body content only
 * - wordPressCSS: Styles
 * - metadata: SEO and meta information
 * 
 * complete.html is ALWAYS generated from these sources, never stored.
 */
export function useHtmlPreviewState({
    markdownContent,
    htmlContent,
    user,
    isOpen = true,
    publishedPageId = null,
    onPageIdChange,
    resetKey,
}: HtmlPreviewHookProps): HtmlPreviewState & HtmlPreviewActions {
    // Copy states
    const [copied, setCopied] = useState(false);
    const [copiedNoBullets, setCopiedNoBullets] = useState(false);
    const [copiedCSS, setCopiedCSS] = useState(false);
    const [copiedComplete, setCopiedComplete] = useState(false);
    const [copiedCustom, setCopiedCustom] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState(false);

    // Markdown content (initial source)
    const [initialMarkdown] = useState<string>(markdownContent);
    const [currentMarkdown, setCurrentMarkdown] = useState<string>(markdownContent);

    // SOURCE FILES - SINGLE SOURCE OF TRUTH
    const [contentHtml, setContentHtml] = useState<string>(() => {
        // Initialize from provided htmlContent or generate from markdown
        if (htmlContent) {
            return extractBodyContent(htmlContent, "");
        }
        return markdownToHtml(removeThinkingContent(markdownContent));
    });

    const [wordPressCSS, setWordPressCSSInternal] = useState<string>(() => getMarkdownStylesheet());
    
    // Initialize metadata as empty to avoid hydration mismatch
    // Will be populated in useEffect after component mounts (client-side only)
    const [metadata, setMetadataInternal] = useState<HtmlMetadata>(() => createEmptyMetadata());

    // Source tracking
    const [isMarkdownDirty, setIsMarkdownDirty] = useState(false);
    const [isContentDirty, setIsContentDirty] = useState(false);

    // Published page state
    const [publishedPageUrl, setPublishedPageUrl] = useState<string | null>(null);
    const [savedPage, setSavedPage] = useState<any>(null);

    // Custom copy options
    const [includeBulletStyles, setIncludeBulletStyles] = useState(true);
    const [includeDecorativeLineBreaks, setIncludeDecorativeLineBreaks] = useState(true);
    const [showAdvancedMeta, setShowAdvancedMeta] = useState<boolean>(false);

    // HTML Pages system
    const { createHTMLPage, updateHTMLPage, isCreating, error, clearError } = useHTMLPages(user?.id);

    // =================================================================
    // SOURCE FILE SETTERS
    // =================================================================

    /**
     * Normalize HTML for comparison (remove extra whitespace, normalize formatting)
     * This prevents formatting changes from marking content as dirty
     */
    const normalizeHtml = useCallback((html: string): string => {
        return html
            .replace(/\s+/g, ' ')        // Collapse all whitespace to single space
            .replace(/>\s+</g, '><')     // Remove whitespace between tags
            .trim();
    }, []);

    const setContentHtmlWithDirtyFlag = useCallback((html: string) => {
        // Only mark as dirty if content actually changed (not just formatting)
        const normalizedNew = normalizeHtml(html);
        const normalizedCurrent = normalizeHtml(contentHtml);
        
        setContentHtml(html);
        
        if (normalizedNew !== normalizedCurrent) {
            setIsContentDirty(true);
            setIsMarkdownDirty(false); // Content edits override markdown
        }
    }, [contentHtml, normalizeHtml]);

    const setWordPressCSS = useCallback((css: string) => {
        setWordPressCSSInternal(css);
    }, []);

    const setMetadata = useCallback((meta: HtmlMetadata) => {
        setMetadataInternal(meta);
    }, []);

    const setMetadataFromJson = useCallback((json: string) => {
        try {
            const parsed = parseJsonToMetadata(json);
            setMetadataInternal(parsed);
        } catch (error) {
            console.error("Failed to parse metadata JSON:", error);
        }
    }, []);

    const setMetadataField = useCallback(<K extends keyof HtmlMetadata>(field: K, value: HtmlMetadata[K]) => {
        setMetadataInternal(prev => ({
            ...prev,
            [field]: value,
        }));
    }, []);

    // =================================================================
    // CORE UTILITY FUNCTIONS
    // =================================================================

    /**
     * Generate complete HTML from current source files
     */
    const generateCompleteHtmlFromSourcesCallback = useCallback(() => {
        return generateCompleteHtmlFromSources({
            contentHtml,
            wordPressCSS,
            metadata,
        });
    }, [contentHtml, wordPressCSS, metadata]);

    /**
     * Extract metadata FROM content.html
     */
    const extractMetadataFromContentCallback = useCallback(() => {
        const extracted = extractMetadataUtil(contentHtml);
        setMetadataInternal(prev => ({
            ...prev,
            ...extracted,
        }));
    }, [contentHtml]);

    /**
     * Get current preview URL
     */
    const getCurrentPreviewUrl = useCallback((): string | null => {
        return publishedPageUrl;
    }, [publishedPageUrl]);

    // =================================================================
    // COPY HANDLERS (using source files)
    // =================================================================

    const handleCopyHtml = useCallback(async () => {
        await copyToClipboard(contentHtml, {
            onSuccess: () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            },
            onError: (err) => console.error("Failed to copy HTML:", err),
        });
    }, [contentHtml]);

    const handleCopyHtmlNoBullets = useCallback(async () => {
        const noBulletsHtml = stripBulletStyles(contentHtml);
        await copyToClipboard(noBulletsHtml, {
            onSuccess: () => {
                setCopiedNoBullets(true);
                setTimeout(() => setCopiedNoBullets(false), 2000);
            },
            onError: (err) => console.error("Failed to copy HTML without bullet styles:", err),
        });
    }, [contentHtml]);

    const handleCopyCSS = useCallback(async () => {
        await copyToClipboard(wordPressCSS, {
            onSuccess: () => {
                setCopiedCSS(true);
                setTimeout(() => setCopiedCSS(false), 2000);
            },
            onError: (err) => console.error("Failed to copy CSS:", err),
        });
    }, [wordPressCSS]);

    const handleCopyComplete = useCallback(async () => {
        const completeHTML = generateCompleteHtmlFromSourcesCallback();
        await copyToClipboard(completeHTML, {
            onSuccess: () => {
                setCopiedComplete(true);
                setTimeout(() => setCopiedComplete(false), 2000);
            },
            onError: (err) => console.error("Failed to copy complete HTML:", err),
        });
    }, [generateCompleteHtmlFromSourcesCallback]);

    const handleCopyCustom = useCallback(async () => {
        const customHTML = applyCustomOptions(contentHtml, {
            includeBulletStyles,
            includeDecorativeLineBreaks,
        });
        await copyToClipboard(customHTML, {
            onSuccess: () => {
                setCopiedCustom(true);
                setTimeout(() => setCopiedCustom(false), 2000);
            },
            onError: (err) => console.error("Failed to copy custom HTML:", err),
        });
    }, [contentHtml, includeBulletStyles, includeDecorativeLineBreaks]);

    const handleCopyUrl = useCallback(async (url: string) => {
        await copyToClipboard(url, {
            onSuccess: () => {
                setCopiedUrl(true);
                setTimeout(() => setCopiedUrl(false), 1500);
            },
            onError: (err) => console.error("Failed to copy URL:", err),
        });
    }, []);

    // =================================================================
    // REGENERATE & PUBLISH (using source files)
    // =================================================================

    /**
     * Regenerate HTML from markdown if dirty, then publish
     */
    const handleRegenerateHtml = useCallback(async (useMetadata: boolean = false) => {
        if (!user?.id) {
            clearError();
            // Surface as error state so the UI can display it (no browser alert)
            console.error('[HtmlPreview] Cannot generate page: user not authenticated');
            return;
        }

        try {
            clearError();

            // Determine which content and metadata to use
            let finalContentHtml = contentHtml;
            let finalMetadata = metadata;

            // Step 1: If markdown is dirty, regenerate content.html from markdown
            if (isMarkdownDirty) {
                const newContentHtml = markdownToHtml(removeThinkingContent(currentMarkdown));
                finalContentHtml = newContentHtml; // Use the new content
                setContentHtml(newContentHtml);
                
                // ALWAYS extract and update metadata (even if empty)
                const extracted = extractMetadataUtil(newContentHtml);
                finalMetadata = {
                    ...metadata,
                    title: extracted.title || metadata.title,
                    description: extracted.description || metadata.description,
                    metaTitle: extracted.metaTitle || extracted.title || metadata.metaTitle,
                    metaDescription: extracted.metaDescription || extracted.description || metadata.metaDescription,
                };
                setMetadataInternal(finalMetadata);
            }

            // Clear dirty flags
            setIsMarkdownDirty(false);
            setIsContentDirty(false);

            // Step 2: Generate complete HTML from CURRENT source files (use final values, not closure values)
            const completeHtml = generateCompleteHtmlFromSources({
                contentHtml: finalContentHtml,
                wordPressCSS,
                metadata: finalMetadata,
            });

            // Step 3: Prepare metadata for API
            const metaTitle = finalMetadata.metaTitle || finalMetadata.title || "Generated Content";
            const metaDescription = finalMetadata.metaDescription || finalMetadata.description || "";
            const metaFields = useMetadata ? {
                metaKeywords: finalMetadata.metaKeywords || null,
                ogImage: finalMetadata.ogImage || null,
                canonicalUrl: finalMetadata.canonicalUrl || null,
                isIndexable: finalMetadata.isIndexable || false,
            } : {};

            // Step 4: API call - Create or update page
            let result;
            if (publishedPageId) {
                console.log("📝 Updating existing page with ID:", publishedPageId);
                result = await updateHTMLPage(publishedPageId, completeHtml, metaTitle, metaDescription, metaFields);
            } else {
                console.log("✨ Creating NEW page (no existing ID)");
                result = await createHTMLPage(completeHtml, metaTitle, metaDescription, metaFields);
                console.log("📌 New page created with ID:", result.pageId);
                onPageIdChange?.(result.pageId);
            }

            // Step 5: Update state with results
            setPublishedPageUrl(result.url);
            if (useMetadata) {
                setSavedPage(result);
            }
        } catch (err: any) {
            console.error("Generate/update failed:", err);
        }
    }, [
        user,
        isMarkdownDirty,
        currentMarkdown,
        contentHtml,
        wordPressCSS,
        metadata,
        publishedPageId,
        clearError,
        createHTMLPage,
        updateHTMLPage,
        onPageIdChange,
    ]);

    /**
     * Publish page with metadata (wrapper for handleRegenerateHtml)
     */
    const handleSavePage = useCallback(async () => {
        if (!metadata.title.trim()) {
            // The Save button is already disabled when title is empty — this is a safety guard
            return;
        }

        if (!user?.id) {
            // Save button is disabled when !user — this is a safety guard
            return;
        }

            await handleRegenerateHtml(true);
    }, [metadata.title, user, handleRegenerateHtml]);

    /**
     * Update source files from current markdown
     * This regenerates content.html, extracts metadata, etc. from the CURRENT markdown
     */
    const handleUpdateFromMarkdown = useCallback(() => {
        // Regenerate content.html from current markdown
        const newContentHtml = markdownToHtml(removeThinkingContent(currentMarkdown));
        setContentHtml(newContentHtml);
        
        // ALWAYS extract and update metadata (even if empty)
        const extracted = extractMetadataUtil(newContentHtml);
        setMetadataInternal(prev => ({
            ...prev,
            title: extracted.title || prev.title,
            description: extracted.description || prev.description,
            metaTitle: extracted.metaTitle || extracted.title || prev.metaTitle,
            metaDescription: extracted.metaDescription || extracted.description || prev.metaDescription,
        }));
        
        // Clear dirty flags (content is now up-to-date with markdown)
        setIsMarkdownDirty(false);
        setIsContentDirty(false);
    }, [currentMarkdown]);

    /**
     * Reset to original markdown (this is the "Reset" button)
     * Reverts everything back to initial state
     */
    const handleRefreshMarkdown = useCallback(() => {
        // Reset markdown to original
        setCurrentMarkdown(initialMarkdown);
        
        // Regenerate content.html from original markdown
        const newContentHtml = markdownToHtml(removeThinkingContent(initialMarkdown));
        setContentHtml(newContentHtml);
        
        // ALWAYS extract and update metadata (even if empty)
        const extracted = extractMetadataUtil(newContentHtml);
        setMetadataInternal(prev => ({
            ...prev,
            title: extracted.title || prev.title,
            description: extracted.description || prev.description,
            metaTitle: extracted.metaTitle || extracted.title || prev.metaTitle,
            metaDescription: extracted.metaDescription || extracted.description || prev.metaDescription,
        }));
        
        // Clear dirty flags
        setIsMarkdownDirty(false);
        setIsContentDirty(false);
    }, [initialMarkdown]);

    // =================================================================
    // EFFECTS
    // =================================================================

    // Extract initial metadata from content (client-side only, after mount)
    // This prevents hydration mismatch since extractMetadataUtil uses DOM APIs
    useEffect(() => {
        // Only run once on mount
        const extracted = extractMetadataUtil(contentHtml);
        if (extracted.title || extracted.description) {
            setMetadataInternal({
                ...createEmptyMetadata(),
                title: extracted.title || '',
                description: extracted.description || '',
                metaTitle: extracted.metaTitle || extracted.title || '',
                metaDescription: extracted.metaDescription || extracted.description || '',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount

    // Sync markdown when modal opens
    useEffect(() => {
        if (isOpen && markdownContent) {
            setCurrentMarkdown(markdownContent);
        }
    }, [isOpen, markdownContent]);

    // Track markdown edits
    useEffect(() => {
        if (currentMarkdown !== initialMarkdown) {
            setIsMarkdownDirty(true);
            setIsContentDirty(false);
        }
    }, [currentMarkdown, initialMarkdown]);

    // Reset state when resetKey changes
    useEffect(() => {
        if (resetKey !== undefined && resetKey > 0) {
            console.log("🔄 Hook reset triggered - resetKey:", resetKey);
            setPublishedPageUrl(null);
            setSavedPage(null);
            setIsMarkdownDirty(false);
            setIsContentDirty(false);
            setMetadataInternal(createEmptyMetadata());
            setShowAdvancedMeta(false);
            console.log("✅ Hook state cleared - ready for new content");
        }
    }, [resetKey]);

    // =================================================================
    // RETURN STATE & ACTIONS
    // =================================================================

    return {
        // Copy states
        copied,
        copiedNoBullets,
        copiedCSS,
        copiedComplete,
        copiedCustom,
        copiedUrl,

        // Markdown
        initialMarkdown,
        currentMarkdown,

        // SOURCE FILES
        contentHtml,
        wordPressCSS,
        metadata,

        // Dirty flags
        isMarkdownDirty,
        isContentDirty,

        // Custom copy options
        includeBulletStyles,
        includeDecorativeLineBreaks,

        // Page state
        savedPage,
        publishedPageUrl,
        showAdvancedMeta,

        // System state
        isCreating,
        error,

        // Copy state setters
        setCopied,
        setCopiedNoBullets,
        setCopiedCSS,
        setCopiedComplete,
        setCopiedCustom,
        setCopiedUrl,

        // Markdown setters
        setCurrentMarkdown,

        // SOURCE FILE SETTERS
        setContentHtml: setContentHtmlWithDirtyFlag,
        setWordPressCSS,
        setMetadata,
        setMetadataFromJson,
        setMetadataField,

        // Custom copy options setters
        setIncludeBulletStyles,
        setIncludeDecorativeLineBreaks,

        // Page state setters
        setSavedPage,
        setPublishedPageUrl,
        setShowAdvancedMeta,

        // Copy handlers
        handleCopyHtml,
        handleCopyHtmlNoBullets,
        handleCopyCSS,
        handleCopyComplete,
        handleCopyCustom,
        handleCopyUrl,

        // Publish/regenerate handlers
        handleSavePage,
        handleRegenerateHtml,
        handleRefreshMarkdown,
        handleUpdateFromMarkdown,

        // Metadata extraction
        extractMetadataFromContent: extractMetadataFromContentCallback,

        // Utility functions
        generateCompleteHtmlFromSources: generateCompleteHtmlFromSourcesCallback,
        getCurrentPreviewUrl,
        extractBodyContent: (html) => extractBodyContent(html, contentHtml),
        stripBulletStyles,
        stripDecorativeLineBreaks,
        applyCustomOptions: (html: string) => applyCustomOptions(html, { includeBulletStyles, includeDecorativeLineBreaks }),
        extractTitleFromHTML: (html) => {
            // Simple extraction for backward compatibility (SSR-safe)
            if (typeof document === 'undefined') return "";
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = html;
            const h1 = tempDiv.querySelector("h1");
            return h1?.textContent?.trim() || "";
        },
        extractDescriptionFromHTML: (html) => {
            // Simple extraction for backward compatibility (SSR-safe)
            if (typeof document === 'undefined') return "";
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = html;
            const p = tempDiv.querySelector("p");
            return p?.textContent?.trim() || "";
        },
        getCharacterCountStatus,
        getSEORecommendation,

        // Error handling
        clearError,
    };
}
