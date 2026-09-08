import { escapeHtml } from "@ai-matrx/kit/html-escape";
/**
 * HTML Source Files Architecture
 * 
 * This module manages the SINGLE SOURCE OF TRUTH architecture for HTML pages.
 * All HTML content is derived from these source files:
 * - content.html: Body content (editable)
 * - wordpress.css: Styles (editable)
 * - metadata.json: SEO and meta information (editable)
 * - scripts.js: Future support for LD+JSON and other scripts (editable)
 * - complete.html: Generated from above (READ-ONLY)
 */

export interface HtmlMetadata {
    title: string;
    description: string;
    metaTitle: string;
    metaDescription: string;
    metaKeywords: string;
    ogImage: string;
    canonicalUrl: string;
    isIndexable?: boolean;
}

export interface HtmlSourceFiles {
    contentHtml: string;        // Body content only
    wordPressCSS: string;       // CSS rules
    metadata: HtmlMetadata;     // SEO metadata
    scripts?: string;           // LD+JSON and other scripts (future)
}

/**
 * Generate complete HTML from source files
 * This is the ONLY way to create complete.html
 */
export function generateCompleteHtmlFromSources(sources: HtmlSourceFiles): string {
    const { contentHtml, wordPressCSS, metadata, scripts = '' } = sources;
    
    // Use metadata title, fallback to extracted title
    const extractedTitle = extractTitleFromContent(contentHtml);
    const pageTitle = metadata.metaTitle || metadata.title || extractedTitle || "WordPress Content";
    const pageDescription = metadata.metaDescription || metadata.description || "";
    
    // Build meta tags
    const metaTags: string[] = [];
    
    // Robots meta tag - default to noindex if not explicitly set to true
    if (!metadata.isIndexable) {
        metaTags.push(`    <meta name="robots" content="noindex, nofollow">`);
    }
    
    if (pageDescription) {
        metaTags.push(`    <meta name="description" content="${escapeHtml(pageDescription)}">`);
    }
    
    if (metadata.metaKeywords) {
        metaTags.push(`    <meta name="keywords" content="${escapeHtml(metadata.metaKeywords)}">`);
    }
    
    // Open Graph tags
    if (metadata.metaTitle || pageTitle) {
        metaTags.push(`    <meta property="og:title" content="${escapeHtml(metadata.metaTitle || pageTitle)}">`);
    }
    
    if (metadata.metaDescription || pageDescription) {
        metaTags.push(`    <meta property="og:description" content="${escapeHtml(metadata.metaDescription || pageDescription)}">`);
    }
    
    if (metadata.ogImage) {
        metaTags.push(`    <meta property="og:image" content="${escapeHtml(metadata.ogImage)}">`);
    }
    
    // Canonical URL
    if (metadata.canonicalUrl) {
        metaTags.push(`    <link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}">`);
    }
    
    const metaTagsString = metaTags.length > 0 ? '\n' + metaTags.join('\n') : '';
    const scriptsString = scripts ? `\n    ${scripts}` : '';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(pageTitle)}</title>${metaTagsString}
    <style>
${wordPressCSS}
    </style>${scriptsString}
</head>
<body>
    ${contentHtml}
</body>
</html>`;
}

/**
 * Extract title from HTML content
 * SSR-safe: Returns empty string if document is not available
 */
export function extractTitleFromContent(htmlContent: string): string {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') {
        return "";
    }

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
 * Extract description from HTML content
 * SSR-safe: Returns empty string if document is not available
 */
export function extractDescriptionFromContent(htmlContent: string): string {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') {
        return "";
    }

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
                    const text = nextElement.textContent.trim();
                    // Limit to ~160 characters for SEO
                    return text.length > 160 ? text.substring(0, 157) + "..." : text;
                }
                nextElement = nextElement.nextElementSibling;
            }
        }

        // Fallback: find any paragraph
        const firstParagraph = tempDiv.querySelector("p");
        if (firstParagraph && firstParagraph.textContent?.trim()) {
            const text = firstParagraph.textContent.trim();
            return text.length > 160 ? text.substring(0, 157) + "..." : text;
        }

        return "";
    } catch (error) {
        console.error("Error extracting description from HTML:", error);
        return "";
    }
}

/**
 * Extract metadata from content HTML
 * Used for the "Extract" button functionality
 */
export function extractMetadataFromContent(contentHtml: string): Partial<HtmlMetadata> {
    const title = extractTitleFromContent(contentHtml);
    const description = extractDescriptionFromContent(contentHtml);
    
    return {
        title,
        description,
        metaTitle: title,
        metaDescription: description,
    };
}

/**
 * Update title in content HTML
 * Finds the first h1/h2 and updates it
 * SSR-safe: Returns original content if document is not available
 */
export function updateTitleInContent(contentHtml: string, newTitle: string): string {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') {
        return contentHtml;
    }

    try {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = contentHtml;

        const h1 = tempDiv.querySelector("h1");
        if (h1) {
            h1.textContent = newTitle;
            return tempDiv.innerHTML;
        }

        const h2 = tempDiv.querySelector("h2");
        if (h2) {
            h2.textContent = newTitle;
            return tempDiv.innerHTML;
        }

        // If no heading found, prepend an h1
        const newH1 = document.createElement("h1");
        newH1.textContent = newTitle;
        tempDiv.insertBefore(newH1, tempDiv.firstChild);
        return tempDiv.innerHTML;
    } catch (error) {
        console.error("Error updating title in content:", error);
        return contentHtml;
    }
}

/**
 * Parse complete HTML to extract source files
 * Used when loading from database or external source
 * SSR-safe: Returns empty object if DOMParser is not available
 */
export function parseCompleteHtmlToSources(completeHtml: string): Partial<HtmlSourceFiles> {
    // Check if we're in a browser environment
    if (typeof DOMParser === 'undefined') {
        return {};
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(completeHtml, 'text/html');
        
        // Extract body content
        const body = doc.body;
        const contentHtml = body ? body.innerHTML : '';
        
        // Extract CSS
        const styleTag = doc.querySelector('style');
        const wordPressCSS = styleTag ? styleTag.textContent || '' : '';
        
        // Extract metadata
        const titleTag = doc.querySelector('title');
        const metaDescription = doc.querySelector('meta[name="description"]');
        const metaKeywords = doc.querySelector('meta[name="keywords"]');
        const ogTitle = doc.querySelector('meta[property="og:title"]');
        const ogDescription = doc.querySelector('meta[property="og:description"]');
        const ogImage = doc.querySelector('meta[property="og:image"]');
        const canonical = doc.querySelector('link[rel="canonical"]');
        
        const metadata: HtmlMetadata = {
            title: titleTag?.textContent || '',
            description: metaDescription?.getAttribute('content') || '',
            metaTitle: ogTitle?.getAttribute('content') || titleTag?.textContent || '',
            metaDescription: ogDescription?.getAttribute('content') || metaDescription?.getAttribute('content') || '',
            metaKeywords: metaKeywords?.getAttribute('content') || '',
            ogImage: ogImage?.getAttribute('content') || '',
            canonicalUrl: canonical?.getAttribute('href') || '',
        };
        
        return {
            contentHtml,
            wordPressCSS,
            metadata,
        };
    } catch (error) {
        console.error("Error parsing complete HTML:", error);
        return {};
    }
}

/**
 * Create empty metadata object
 */
export function createEmptyMetadata(): HtmlMetadata {
    return {
        title: '',
        description: '',
        metaTitle: '',
        metaDescription: '',
        metaKeywords: '',
        ogImage: '',
        canonicalUrl: '',
        isIndexable: false,
    };
}

/**
 * Format metadata as JSON for display in code editor
 */
export function formatMetadataAsJson(metadata: HtmlMetadata): string {
    return JSON.stringify(metadata, null, 2);
}

/**
 * Parse JSON string to metadata object
 */
export function parseJsonToMetadata(jsonString: string): HtmlMetadata {
    try {
        const parsed = JSON.parse(jsonString);
        return {
            title: parsed.title || '',
            description: parsed.description || '',
            metaTitle: parsed.metaTitle || '',
            metaDescription: parsed.metaDescription || '',
            metaKeywords: parsed.metaKeywords || '',
            ogImage: parsed.ogImage || '',
            canonicalUrl: parsed.canonicalUrl || '',
            isIndexable: parsed.isIndexable || false,
        };
    } catch (error) {
        console.error("Error parsing JSON to metadata:", error);
        return createEmptyMetadata();
    }
}

/**
 * Check if two metadata objects are different
 */
export function isMetadataDifferent(meta1: HtmlMetadata, meta2: HtmlMetadata): boolean {
    return (
        meta1.title !== meta2.title ||
        meta1.description !== meta2.description ||
        meta1.metaTitle !== meta2.metaTitle ||
        meta1.metaDescription !== meta2.metaDescription ||
        meta1.metaKeywords !== meta2.metaKeywords ||
        meta1.ogImage !== meta2.ogImage ||
        meta1.canonicalUrl !== meta2.canonicalUrl ||
        meta1.isIndexable !== meta2.isIndexable
    );
}

