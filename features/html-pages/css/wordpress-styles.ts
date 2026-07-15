/**
 * SINGLE SOURCE OF TRUTH for WordPress/HTML Preview CSS
 * 
 * This file contains the master CSS that is used everywhere:
 * - HTML Preview Modal
 * - Copy operations
 * - Saved HTML pages
 * - Message options menu
 * 
 * ANY changes to styling should ONLY be made here!
 */

export const WORDPRESS_CSS = `/* 
 * MATRX WordPress CSS - Production Ready
 * Use this CSS in your WordPress theme to style MATRX content
 * All styles are scoped to .matrx-content-container to avoid conflicts
 */

/* Content Container */
.matrx-content-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    line-height: 1.6;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

/* Typography */
.matrx-h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 1.5rem 0;
    color: #1a1a1a;
    line-height: 1.2;
}

.matrx-h2 {
    font-size: 1.8rem;
    font-weight: 600;
    margin: 3rem 0 1rem 0 !important;
    color: #2a2a2a;
    line-height: 1.3 !important;
    border-bottom: 2px solid #e5e5e5;
    padding-bottom: 0.75rem !important;
    padding-top: 0 !important;
}

.matrx-h3 {
    font-size: 1.3rem;
    font-weight: 600;
    margin: 2rem 0 1rem 0;
    color: #3a3a3a;
    line-height: 1.4;
}

.matrx-h4 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 1.5rem 0 0.75rem 0;
    color: #3a3a3a;
    line-height: 1.4;
}

.matrx-h5 {
    font-size: 1rem;
    font-weight: 600;
    margin: 1.25rem 0 0.5rem 0;
    color: #3a3a3a;
    line-height: 1.4;
}

.matrx-h6 {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 1rem 0 0.5rem 0;
    color: #3a3a3a;
    line-height: 1.4;
}

/* Paragraphs */
.matrx-intro {
    font-size: 1.1rem;
    color: #4a4a4a;
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: #f8f9fa;
    border-left: 4px solid #d1d5db;
    border-radius: 0 8px 8px 0;
}

.matrx-paragraph {
    font-size: 1rem;
    color: #4a4a4a;
    margin-bottom: 1.5rem;
    text-align: justify;
}

/* Text Formatting */
.matrx-em {
    font-style: italic;
    color: #2a2a2a;
}

.matrx-strong {
    font-weight: 600;
    color: #2a2a2a;
}

/* Links */
.matrx-link {
    color: #374151;
    text-decoration: underline;
    text-decoration-color: #d1d5db;
    text-underline-offset: 3px;
    transition: all 0.2s ease;
}

.matrx-link:hover {
    color: #1f2937;
    text-decoration-color: #9ca3af;
}

/* Images */
.matrx-image {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1.5rem auto;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Lists */
.matrx-list {
    margin: 1.5rem 0;
    padding-left: 0;
}

.matrx-bullet-list {
    list-style: none;
}

.matrx-list-item {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
    position: relative;
    color: #4a4a4a;
}

.matrx-list-item::before {
    content: "•";
    color: #6b7280;
    font-weight: bold;
    position: absolute;
    left: 0;
    top: 0;
    font-size: 1.2rem;
}

/* Numbered Lists */
.matrx-numbered-list {
    list-style: decimal;
    padding-left: 2rem;
}

.matrx-numbered-list > .matrx-list-item {
    padding-left: 0.5rem;
}

.matrx-numbered-list > .matrx-list-item::before {
    content: none;
    /* Remove the bullet */
}

/* Nested list indentation */
.matrx-nested-list {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    padding-left: 1.5rem !important;
}

/* Ensure nested lists within list items are properly indented */
.matrx-list-item > .matrx-list {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    padding-left: 1.5rem;
}

/* For multiple levels of nesting, increase indentation */
.matrx-nested-list .matrx-nested-list {
    padding-left: 1.5rem !important;
}

/* Code */
.matrx-content-container .matrx-inline-code {
    background-color: #f5f5f5;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 0.875rem;
    color: #d73a49;
}

.matrx-content-container .matrx-code-block {
    background-color: #f8f8f8;
    border: 1px solid #e1e1e1;
    border-radius: 0.375rem;
    padding: 1rem;
    margin: 1.5rem 0;
    overflow-x: auto;
}

.matrx-content-container .matrx-code {
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    color: #333;
}

/* Blockquotes */
.matrx-content-container .matrx-blockquote {
    border-left: 4px solid #e1e1e1;
    padding-left: 1rem;
    margin: 1.5rem 0;
    font-style: italic;
    color: #666;
}

/* Tables */
.matrx-content-container .matrx-table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
    border: 1px solid #e1e1e1;
}

.matrx-content-container .matrx-table-header {
    background-color: #f8f9fa;
    font-weight: 600;
    padding: 0.75rem;
    border: 1px solid #e1e1e1;
    text-align: left;
}

.matrx-content-container .matrx-table-cell {
    padding: 0.75rem;
    border: 1px solid #e1e1e1;
}

.matrx-content-container .matrx-table-row:nth-child(even) {
    background-color: #f8f9fa;
}

/* Images */
.matrx-content-container .matrx-image {
    max-width: 100%;
    height: auto;
    border-radius: 0.375rem;
    margin: 1rem 0;
}

/* Horizontal Rules */
.matrx-content-container .matrx-hr {
    border: none;
    border-top: 1px solid #e1e1e1;
    margin: 2rem 0;
}

/* FAQ Styles - Clean Design */
.matrx-faq-item {
    margin-bottom: 2rem;
    padding: 1.5rem;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #d1d5db;
}

.matrx-faq-question {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
    color: #2a2a2a;
}

.matrx-faq-answer {
    margin: 0;
    color: #4a4a4a;
    line-height: 1.6;
}

/* Code Blocks */
.matrx-inline-code {
    background-color: #f5f5f5;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 0.875rem;
    color: #d73a49;
}

.matrx-code-block {
    background-color: #f8f8f8;
    border: 1px solid #e1e1e1;
    border-radius: 0.375rem;
    padding: 1rem;
    margin: 1.5rem 0;
    overflow-x: auto;
}

.matrx-code {
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    color: #333;
}

/* Blockquotes */
.matrx-blockquote {
    border-left: 4px solid #e1e1e1;
    padding-left: 1rem;
    margin: 1.5rem 0;
    font-style: italic;
    color: #666;
}

/* Tables */
.matrx-table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
    border: 1px solid #e1e1e1;
    color: #333333;
}

.matrx-table-head {
    background-color: #f8f9fa;
}

.matrx-table-body {
    background-color: #ffffff;
}

.matrx-table-header {
    background-color: #f8f9fa;
    font-weight: 600;
    padding: 0.75rem;
    border: 1px solid #e1e1e1;
    text-align: left;
    color: #333333;
}

.matrx-table-cell {
    padding: 0.75rem;
    border: 1px solid #e1e1e1;
    color: #333333;
}

.matrx-table-row {
    color: #333333;
}

.matrx-table-row:nth-child(even) {
    background-color: #f8f9fa;
}

/* Ensure table content doesn't inherit external colors */
.matrx-table * {
    color: inherit;
}

/* Images */
.matrx-image {
    max-width: 100%;
    height: auto;
    border-radius: 0.375rem;
    margin: 1rem 0;
}

/* Horizontal Rules */
.matrx-hr {
    border: none;
    border-top: 1px solid #e1e1e1;
    margin: 2rem 0;
}

/* Utility Classes */
.matrx-div {
    margin: 0.5rem 0;
}

.matrx-span {
    /* Inherit parent styling by default */
}

/* Flashcard Styles */
.matrx-flashcards-container {
    margin: 2rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.matrx-flashcard {
    perspective: 1000px;
    perspective-origin: center center;
    height: 200px;
    cursor: pointer;
    position: relative;
    margin-bottom: 0.5rem;
}

.matrx-flashcard-input {
    display: none;
}

.matrx-flashcard-inner {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transition: transform 0.6s;
    transform-style: preserve-3d;
    transform-origin: center center;
}

.matrx-flashcard-input:checked ~ .matrx-flashcard-inner {
    transform: rotateY(180deg);
}

.matrx-flashcard-front,
.matrx-flashcard-back {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    backface-visibility: hidden;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.3s ease;
    box-sizing: border-box;
}

.matrx-flashcard-front {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
}

.matrx-flashcard-back {
    background: linear-gradient(135deg, #2d5016 0%, #1e3a0f 100%);
    color: white;
    transform: rotateY(180deg);
}

.matrx-flashcard:hover .matrx-flashcard-front,
.matrx-flashcard:hover .matrx-flashcard-back {
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
}

.matrx-flashcard-content {
    text-align: center;
    font-size: 1.3rem;
    line-height: 1.8;
    max-height: 100%;
    width: 100%;
    overflow: hidden;
}

.matrx-flashcard-label {
    cursor: pointer;
    user-select: none;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
}

.matrx-flashcard-indicator {
    position: absolute;
    bottom: 12px;
    right: 16px;
    font-size: 0.75rem;
    opacity: 0.8;
    font-weight: 500;
    letter-spacing: 0.5px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
    .matrx-flashcard {
        height: 180px;
    }

    .matrx-flashcard-content {
        font-size: 1rem;
    }

    .matrx-flashcard-front,
    .matrx-flashcard-back {
        padding: 1.25rem;
    }
}

@media (max-width: 480px) {
    .matrx-flashcard {
        height: 160px;
    }

    .matrx-flashcard-content {
        font-size: 0.95rem;
    }

    .matrx-flashcard-front,
    .matrx-flashcard-back {
        padding: 1rem;
    }
}

/* Responsive Design */
@media (max-width: 768px) {
    .matrx-content-container {
        padding: 1rem;
    }

    .matrx-h1 {
        font-size: 2rem;
    }

    .matrx-h2 {
        font-size: 1.5rem;
        margin: 2rem 0 1rem 0 !important;
    }

    .matrx-h3 {
        font-size: 1.2rem;
    }

    .matrx-h4 {
        font-size: 1.05rem;
    }

    .matrx-h5 {
        font-size: 0.95rem;
    }

    .matrx-h6 {
        font-size: 0.9rem;
    }

    .matrx-intro {
        padding: 1rem;
        font-size: 1rem;
    }

    .matrx-faq-question {
        font-size: 1.1rem;
        margin: 1.5rem 0 0.75rem 0;
    }

    .matrx-paragraph {
        text-align: left;
    }

    .matrx-table {
        font-size: 0.875rem;
    }

    .matrx-table-header,
    .matrx-table-cell {
        padding: 0.5rem;
    }

    .matrx-code-block {
        padding: 0.75rem;
        margin: 1rem 0;
    }
}

@media (max-width: 480px) {
    .matrx-content-container {
        padding: 0.75rem;
    }

    .matrx-h1 {
        font-size: 1.75rem;
        margin-bottom: 1rem;
    }

    .matrx-h2 {
        font-size: 1.3rem;
        margin: 1.5rem 0 0.75rem 0 !important;
    }

    .matrx-h3 {
        font-size: 1.1rem;
        margin: 1.5rem 0 0.75rem 0;
    }

    .matrx-h4 {
        font-size: 1rem;
        margin: 1.25rem 0 0.5rem 0;
    }

    .matrx-h5 {
        font-size: 0.9rem;
        margin: 1rem 0 0.5rem 0;
    }

    .matrx-h6 {
        font-size: 0.85rem;
        margin: 1rem 0 0.5rem 0;
    }

    .matrx-intro {
        padding: 0.75rem;
        margin-bottom: 1.5rem;
    }

    .matrx-paragraph {
        margin-bottom: 1.25rem;
    }

    .matrx-list-item {
        margin-bottom: 0.75rem;
    }

    .matrx-table-header,
    .matrx-table-cell {
        padding: 0.375rem;
    }

    .matrx-code-block {
        padding: 0.5rem;
        font-size: 0.8rem;
    }

    .matrx-inline-code {
        font-size: 0.8rem;
    }
}`;

/**
 * Get the WordPress CSS as a string
 * This is the ONLY function that should be used to get CSS content
 */
export function getWordPressCSS(): string {
    return WORDPRESS_CSS;
}

/**
 * Async accessor for the WordPress CSS, kept for the existing await-shaped
 * call sites. Previously this fetch()ed `/features/html-pages/utils/…​.ts` —
 * a source path that is never served (404 + console.warn on every call in
 * prod, and TS source injected as "CSS" had any dev proxy answered 200).
 * The embedded stylesheet IS the source of truth; return it directly.
 */
export async function loadWordPressCSS(): Promise<string> {
    return getWordPressCSS();
}
