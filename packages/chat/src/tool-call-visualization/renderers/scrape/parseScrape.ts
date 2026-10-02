/**
 * parseScrape — the canonical parser for the web page-read / scrape family
 * (`web_read`, `core_web_read_web_pages`).
 *
 * ─── The wire reality (verified from the DB) ─────────────────────────────────
 *
 * These tools fetch the FULL text of one or more pages and return it WHOLE at
 * `tool_completed` (not token-streamed). The real shape is:
 *
 *   arguments: { urls: ["https://example.com/a", "https://example.com/b"] }
 *   output (json):
 *     {
 *       "pages": [
 *         {
 *           "url": "https://example.com/a",
 *           "content": "Here is the content from page https://example.com/a: \"\"\"\n<page text…>\"\"\""
 *         },
 *         …
 *       ]
 *     }
 *
 * The page `content` is almost always wrapped in a fixed envelope:
 *
 *   Here is the content from page <url>: """<actual text>"""
 *
 * which this parser strips so the renderer shows just the page body.
 *
 * Title / preview image / AI-review are NOT in today's wire shape — they are
 * best-effort / optional. The parser:
 *   • derives a best-effort `title` from the page body (first markdown heading,
 *     else the first substantial line), since the wire carries none;
 *   • surfaces an `image` ONLY if a future page object carries one
 *     (`image` / `imageUrl` / `image_url` / `og_image` / `thumbnail`);
 *   • surfaces an `aiReview` ONLY if one is present
 *     (`review` / `ai_review` / `summary` / `analysis`).
 *
 * It NEVER throws; missing pieces yield empty arrays / undefined. Robust to a
 * partial mid-stream blob, a bare string output, or a JSON string output.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getDomain } from "../search/parseSearch";

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

/** One fully-read page. */
export interface ScrapePage {
    /** The page URL (from the page object, or recovered from the envelope). */
    url: string;
    /** Host without `www.`, stamped for display. */
    domain: string;
    /** Best-effort title (heading / first line of the body). May be empty. */
    title: string;
    /** The unwrapped page body text (envelope stripped). */
    content: string;
    /**
     * A snippet for the card — the body with a leading markdown heading removed
     * (that heading already became {@link title}, so showing it again as raw
     * `#` text in the snippet is redundant). Falls back to `content`.
     */
    preview: string;
    /** Character count of the unwrapped body. */
    charCount: number;
    /** Optional preview image URL — ONLY when the page object carried one. */
    image?: string;
    /** Optional AI review/summary line — ONLY when present. */
    aiReview?: string;
}

export interface ParsedScrape {
    /** Every page read, in wire order. */
    pages: ScrapePage[];
    /** The URLs the tool was asked to read (from `arguments.urls`). */
    requestedUrls: string[];
    /** Total characters across all page bodies. */
    totalChars: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY: ParsedScrape = { pages: [], requestedUrls: [], totalChars: 0 };

/**
 * Strip the `Here is the content from page <url>: """…"""` envelope the read
 * tools wrap every page body in. Tolerant: handles the triple-quote form, a
 * missing closing fence (mid-stream), and the bare un-enveloped body.
 */
export function unwrapPageContent(raw: string): string {
    if (!raw) return "";
    let text = raw;

    // Drop the leading "Here is the content from page <url>: " preamble.
    text = text.replace(
        /^\s*Here is the content from page\s+\S+\s*:\s*/i,
        "",
    );

    // Strip a leading triple-quote fence (""" or ''') and its trailing twin.
    const fenceStart = text.match(/^\s*("""|''')/);
    if (fenceStart) {
        text = text.slice(fenceStart[0].length);
        const fence = fenceStart[1];
        const endIdx = text.lastIndexOf(fence);
        if (endIdx !== -1) text = text.slice(0, endIdx);
    }

    return text.trim();
}

/** Recover a page URL from the envelope preamble when the object lacks one. */
function urlFromEnvelope(raw: string): string {
    const m = raw.match(/Here is the content from page\s+(\S+)\s*:/i);
    return m?.[1]?.trim() ?? "";
}

/**
 * Derive a best-effort title from the page body. Prefer the first markdown
 * heading; else the first substantial non-blank line (trimmed of markdown
 * noise). Capped so a card header never wraps into a paragraph.
 */
function deriveTitle(body: string): string {
    if (!body) return "";
    const lines = body.split("\n");

    // First markdown heading.
    for (const line of lines) {
        const h = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
        if (h && h[1].trim().length > 0) return h[1].trim().slice(0, 120);
    }

    // Else the first substantial line.
    for (const line of lines) {
        const t = line.replace(/^[#>*\-\s]+/, "").trim();
        if (t.length >= 3) return t.slice(0, 120);
    }
    return "";
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** First present optional string among a set of candidate keys on an object. */
function firstKey(
    obj: Record<string, unknown>,
    keys: string[],
): string | undefined {
    for (const k of keys) {
        const v = asString(obj[k]);
        if (v) return v;
    }
    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: parse a raw page-read object into structured pages
// ─────────────────────────────────────────────────────────────────────────────

interface RawPage {
    url?: unknown;
    content?: unknown;
    text?: unknown;
    image?: unknown;
    imageUrl?: unknown;
    image_url?: unknown;
    og_image?: unknown;
    thumbnail?: unknown;
    review?: unknown;
    ai_review?: unknown;
    summary?: unknown;
    analysis?: unknown;
    title?: unknown;
}

function toPage(raw: RawPage): ScrapePage | null {
    const rawContent =
        asString(raw.content) ?? asString(raw.text) ?? "";
    const content = unwrapPageContent(rawContent);
    const url =
        asString(raw.url) ?? urlFromEnvelope(rawContent) ?? "";
    if (!url && !content) return null;

    const obj = raw as Record<string, unknown>;
    const wireTitle = asString(raw.title);
    const image = firstKey(obj, [
        "image",
        "imageUrl",
        "image_url",
        "og_image",
        "thumbnail",
    ]);
    const aiReview = firstKey(obj, [
        "review",
        "ai_review",
        "summary",
        "analysis",
    ]);

    const title = wireTitle ?? deriveTitle(content);
    // Snippet skips a leading markdown heading (it's already the title).
    const preview = content.replace(/^\s{0,3}#{1,6}\s+.+?\n+/, "").trim() || content;

    return {
        url,
        domain: url ? getDomain(url) : "",
        title,
        content,
        preview,
        charCount: content.length,
        image,
        aiReview,
    };
}

/**
 * Parse a page-read tool's result (object | JSON string) + its arguments into
 * structured pages. Always returns a well-formed shape; never throws.
 */
export function parseScrape(entry: ToolLifecycleEntry): ParsedScrape {
    // Requested URLs from the call args (present from the first frame).
    const args = entry.arguments as Record<string, unknown> | undefined;
    const requestedUrls = Array.isArray(args?.urls)
        ? (args!.urls as unknown[]).filter(
              (u): u is string => typeof u === "string" && u.length > 0,
          )
        : typeof args?.url === "string" && args.url
          ? [args.url as string]
          : [];

    // The result may be an object, a JSON string, or a bare string.
    let resultObj: Record<string, unknown> | null = null;
    const r = entry.result;
    if (r && typeof r === "object" && !Array.isArray(r)) {
        resultObj = r as Record<string, unknown>;
    } else if (typeof r === "string" && r.trim().startsWith("{")) {
        try {
            const parsed = JSON.parse(r);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                resultObj = parsed as Record<string, unknown>;
            }
        } catch {
            // fall through — bare string handled below
        }
    }

    let pages: ScrapePage[] = [];

    if (resultObj && Array.isArray(resultObj.pages)) {
        pages = (resultObj.pages as RawPage[])
            .map(toPage)
            .filter((p): p is ScrapePage => p !== null);
    } else if (typeof r === "string" && r.trim().length > 0) {
        // A bare string output (single un-enveloped or enveloped page body).
        const single = toPage({ content: r });
        if (single) pages = [single];
    }

    const totalChars = pages.reduce((acc, p) => acc + p.charCount, 0);
    if (pages.length === 0) return { ...EMPTY, requestedUrls };

    return { pages, requestedUrls, totalChars };
}
