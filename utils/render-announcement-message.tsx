import React from 'react';

const LINK_CLASS = "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline font-medium";

/**
 * Renders a URL as a clickable anchor element.
 */
function renderLink(url: string, text: string, key: number): React.ReactNode {
    return (
        <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
        >
            {text}
        </a>
    );
}

/**
 * Scans a plain text string for raw URLs (https://... or http://...)
 * and converts them into clickable anchor elements.
 * The URL itself is used as the display text.
 */
function parseRawUrls(text: string, keyStart: number): { nodes: React.ReactNode[]; nextKey: number } {
    // Match URLs that start with http:// or https://, stopping at whitespace or
    // common trailing punctuation that's unlikely to be part of the URL
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let key = keyStart;

    while ((match = urlRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(text.substring(lastIndex, match.index));
        }

        // Strip common trailing punctuation that got captured but isn't part of the URL
        let url = match[0];
        const trailingPunct = /[.,;:!?)]+$/;
        const trailingMatch = url.match(trailingPunct);
        let suffix = '';
        if (trailingMatch) {
            // Keep balanced parens (common in Wikipedia URLs, etc.)
            const openParens = (url.match(/\(/g) || []).length;
            const closeParens = (url.match(/\)/g) || []).length;
            if (closeParens > openParens) {
                const lastCloseParen = url.lastIndexOf(')');
                suffix = url.substring(lastCloseParen);
                url = url.substring(0, lastCloseParen);
            } else {
                suffix = trailingMatch[0];
                url = url.substring(0, url.length - suffix.length);
            }
        }

        nodes.push(renderLink(url, url, key++));
        if (suffix) {
            nodes.push(suffix);
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        nodes.push(text.substring(lastIndex));
    }

    return { nodes: nodes.length > 0 ? nodes : [text], nextKey: key };
}

/**
 * Parses announcement messages and renders links as clickable anchor elements.
 * 
 * Supports two formats:
 * 1. Markdown-style links: [text](url) — uses custom display text
 * 2. Raw URLs: https://example.com — auto-detected, URL used as display text
 * 
 * Only allows http/https URLs to prevent XSS via javascript: URIs.
 * 
 * @example
 * renderAnnouncementMessage("Check [our docs](https://example.com) for details")
 * // Returns: ["Check ", <a href="...">our docs</a>, " for details"]
 * 
 * @example
 * renderAnnouncementMessage("Visit https://example.com for more info")
 * // Returns: ["Visit ", <a href="...">https://example.com</a>, " for more info"]
 */
type MessageSegment =
    | { type: 'text'; content: string }
    | { type: 'link'; content: string; url: string };

export function renderAnnouncementMessage(message: string): React.ReactNode[] {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const segments: MessageSegment[] = [];
    let lastIndex = 0;
    let match;

    // First pass: extract markdown-style links
    while ((match = linkRegex.exec(message)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', content: message.substring(lastIndex, match.index) });
        }

        const linkText = match[1];
        const linkUrl = match[2];

        if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
            segments.push({ type: 'link', content: linkText, url: linkUrl });
        } else {
            // Non-http URL — render as plain text for safety
            segments.push({ type: 'text', content: match[0] });
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < message.length) {
        segments.push({ type: 'text', content: message.substring(lastIndex) });
    }

    if (segments.length === 0) {
        segments.push({ type: 'text', content: message });
    }

    // Second pass: for text segments, auto-detect raw URLs
    const parts: React.ReactNode[] = [];
    let key = 0;

    for (const segment of segments) {
        if (segment.type === 'link') {
            parts.push(renderLink(segment.url, segment.content, key++));
        } else {
            const { nodes, nextKey } = parseRawUrls(segment.content, key);
            parts.push(...nodes);
            key = nextKey;
        }
    }

    return parts;
}
