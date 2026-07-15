/**
 * promoteConvert — split a quick-publish `html_pages` document into the
 * `client_pages` shape (body fragment + extracted styles + preserved head
 * scripts) for the "Promote to site" bridge (W2-A).
 *
 * TS TWIN of aidream's canonical converter
 * (`aidream/services/cms/convert.py`). THE SPEC for both is the my-matrx
 * `/p/[id]` renderer's style/body split branch (`my-matrx/pages/p/[id].js`):
 *   - full document ⇔ content contains `<html` AND a `<head>` open tag;
 *   - styles = EVERY `<style>...</style>` block in the WHOLE document, joined;
 *   - body = inner of the first `<body>...</body>`; no match → passthrough;
 *   - fragments pass through untouched;
 *   - SEO fallbacks mirror the renderer's `<title>` / meta-description
 *     extractors (DB values always win — callers apply that rule).
 *
 * Deliberate divergences from the render-time spec (shared with the Python
 * twin, documented there): extracted `<style>` blocks are REMOVED from the
 * body, inline head scripts are preserved into `js`, and external head
 * resources that cannot carry over are reported in `warnings`.
 *
 * Hardening (2026-07-15 adversarial review, F1–F4 — keep in lockstep with
 * convert.py):
 *   - ASCII-only semantics: explicit `[ \t\n\r\f\v]` whitespace classes
 *     (never bare `\s` — JS adds BOM/\xa0/…, Python adds \x1c-\x1f/\x85),
 *     ASCII-only lowercasing (never `toLowerCase()` for offsets — not
 *     length-preserving for e.g. 'İ', and Unicode folding is banned:
 *     `<ſtyle>` is NOT a style tag), and `asciiTrim` instead of `trim()`.
 *   - Linear tag scanning: `<style>`/`<script>` blocks and `<meta>`/`<link>`
 *     open tags are found by a single forward walk (`scanTagBlocks` /
 *     `scanOpenTags`) instead of document-wide regexes whose per-opening
 *     rescan is O(n²) on unclosed-tag soup (a 350 KB attack took the regex
 *     version 66 s). Callers additionally cap input size
 *     (`MAX_PROMOTE_HTML_BYTES`) as a second, independent layer.
 *
 * Drift guard: BOTH implementations test byte-identically against the SAME
 * language-neutral fixture file — `promote-convert-fixtures.json` beside this
 * module (a copy; the canonical file lives in aidream beside `convert.py`,
 * the C4 `url-rules.json` pattern). Change the fixture → run both suites:
 * here `pnpm test:unit features/html-pages/utils/__tests__`, in aidream
 * `uv run pytest aidream/services/cms/tests/test_cms_convert.py`.
 */

export interface HtmlConversion {
    body: string;
    css: string | null;
    js: string | null;
    extractedTitle: string | null;
    extractedDescription: string | null;
    wasFullDocument: boolean;
    warnings: string[];
}

/** Belt-and-braces input cap for promote callers (largest live row ≈ 200 KB). */
export const MAX_PROMOTE_HTML_BYTES = 2_000_000;

// ASCII-only whitespace — the exact set both twins can express identically.
const WS = " \\t\\n\\r\\f\\v";

const HTML_OPEN_RE = new RegExp(`<html[${WS}>]|<html$`, "i");
const HEAD_OPEN_RE = new RegExp(`<head[${WS}>]|<head$`, "i");
const BODY_RE = /<body[^>]*>([\s\S]*?)<\/body>/i;
const HEAD_RE = /<head[^>]*>([\s\S]*?)<\/head>/i;
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
// Applied per-open-tag (scanOpenTags), never to the whole document (F4).
const META_DESC_INNER_RE = /name=["']description["'][^>]*content=["']([^"']+)["']/i;
const LINK_REL_STYLESHEET_INNER_RE = new RegExp(
    `\\brel[${WS}]*=[${WS}]*["']?stylesheet["']?`,
    "i",
);
const SRC_ATTR_RE = new RegExp(
    `\\bsrc[${WS}]*=[${WS}]*("[^"]*"|'[^']*'|[^${WS}>]+)`,
    "i",
);
const HREF_ATTR_RE = new RegExp(
    `\\bhref[${WS}]*=[${WS}]*("[^"]*"|'[^']*'|[^${WS}>]+)`,
    "i",
);

const ASCII_WS_CHARS = new Set([" ", "\t", "\n", "\r", "\f", "\v"]);

/** Trim ONLY ASCII whitespace — JS `trim()`/Python `strip()` disagree beyond it. */
function asciiTrim(s: string): string {
    let start = 0;
    let end = s.length;
    while (start < end && ASCII_WS_CHARS.has(s[start])) start++;
    while (end > start && ASCII_WS_CHARS.has(s[end - 1])) end--;
    return s.slice(start, end);
}

/**
 * A-Z → a-z ONLY. `toLowerCase()` is not length-preserving for some Unicode
 * (offset misalignment) and Unicode folding is exactly what F1–F3 banned.
 */
function asciiLower(s: string): string {
    return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

interface TagBlock {
    start: number; // offset of '<'
    end: number; // offset just past '</tag>'
    attrs: string; // raw text between '<tag' and its '>'
    inner: string;
}

/**
 * Linear equivalent of `<tag[^>]*>([\s\S]*?)</tag>` (case-insensitive): one
 * forward walk; an opening with no later `>` or `</tag>` ends the scan (the
 * spec regex could produce no further matches either). Kills the O(n²)
 * unclosed-tag DoS (F4).
 */
function scanTagBlocks(html: string, tag: string): TagBlock[] {
    const lower = asciiLower(html);
    const openToken = `<${tag}`;
    const closeToken = `</${tag}>`;
    const blocks: TagBlock[] = [];
    let i = 0;
    for (;;) {
        const s = lower.indexOf(openToken, i);
        if (s === -1) break;
        const gt = lower.indexOf(">", s + openToken.length);
        if (gt === -1) break;
        const c = lower.indexOf(closeToken, gt + 1);
        if (c === -1) break;
        blocks.push({
            start: s,
            end: c + closeToken.length,
            attrs: html.slice(s + openToken.length, gt),
            inner: html.slice(gt + 1, c),
        });
        i = c + closeToken.length;
    }
    return blocks;
}

/** Linear scan for every `<tag ...>` open-tag text (same F4 posture). */
function scanOpenTags(html: string, tag: string): string[] {
    const lower = asciiLower(html);
    const openToken = `<${tag}`;
    const tags: string[] = [];
    let i = 0;
    for (;;) {
        const s = lower.indexOf(openToken, i);
        if (s === -1) break;
        const gt = lower.indexOf(">", s + openToken.length);
        if (gt === -1) break;
        tags.push(html.slice(s, gt + 1));
        i = gt + 1;
    }
    return tags;
}

function removeSpans(text: string, spans: Array<[number, number]>): string {
    if (spans.length === 0) return text;
    const out: string[] = [];
    let prev = 0;
    for (const [start, end] of spans) {
        out.push(text.slice(prev, start));
        prev = end;
    }
    out.push(text.slice(prev));
    return out.join("");
}

function unquote(attrValue: string): string {
    const v = asciiTrim(attrValue);
    if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
        return v.slice(1, -1);
    }
    return v;
}

function firstGroup(pattern: RegExp, html: string): string | null {
    const m = pattern.exec(html);
    return m ? asciiTrim(m[1]) : null;
}

function extractMetaDescription(html: string): string | null {
    for (const tagText of scanOpenTags(html, "meta")) {
        const m = META_DESC_INNER_RE.exec(tagText);
        if (m) return asciiTrim(m[1]);
    }
    return null;
}

export function isFullDocument(html: string): boolean {
    return HTML_OPEN_RE.test(html) && HEAD_OPEN_RE.test(html);
}

/** Never throws on malformed input; linear time in `html.length`. */
export function splitHtmlDocument(rawHtml: string | null | undefined): HtmlConversion {
    const html = rawHtml ?? "";
    const warnings: string[] = [];

    const extractedTitle = firstGroup(TITLE_RE, html);
    const extractedDescription = extractMetaDescription(html);

    if (!isFullDocument(html)) {
        return {
            body: html,
            css: null,
            js: null,
            extractedTitle,
            extractedDescription,
            wasFullDocument: false,
            warnings,
        };
    }

    // Styles: every <style> block in the WHOLE document (spec), joined.
    const styleBlocks = scanTagBlocks(html, "style")
        .map((b) => asciiTrim(b.inner))
        .filter((b) => b.length > 0);
    const css = styleBlocks.length ? styleBlocks.join("\n\n") : null;

    // Body: inner of the first <body>...</body>; no match → whole content.
    const bodyMatch = BODY_RE.exec(html);
    let body: string;
    if (bodyMatch) {
        body = bodyMatch[1];
    } else {
        body = html;
        warnings.push(
            "full document without a matched <body>...</body> — the entire " +
                "document was carried into html_content unchanged",
        );
    }

    // Divergence 1: strip the style blocks we extracted from the body fragment.
    if (css !== null) {
        body = removeSpans(
            body,
            scanTagBlocks(body, "style").map((b) => [b.start, b.end] as [number, number]),
        );
    }

    // Divergences 2 + 3: preserve inline head scripts; warn on external head resources.
    const headMatch = HEAD_RE.exec(html);
    const jsParts: string[] = [];
    if (headMatch) {
        const head = headMatch[1];
        for (const block of scanTagBlocks(head, "script")) {
            const scriptBody = asciiTrim(block.inner);
            const src = SRC_ATTR_RE.exec(block.attrs);
            if (src) {
                warnings.push(`dropped external head script: ${unquote(src[1])}`);
            } else if (scriptBody) {
                jsParts.push(scriptBody);
            }
        }
        for (const linkTag of scanOpenTags(head, "link")) {
            if (!LINK_REL_STYLESHEET_INNER_RE.test(linkTag)) continue;
            const href = HREF_ATTR_RE.exec(linkTag);
            warnings.push(
                `dropped external head stylesheet: ${href ? unquote(href[1]) : "(no href)"}`,
            );
        }
    }
    const js = jsParts.length ? jsParts.join("\n\n") : null;

    return {
        body: asciiTrim(body),
        css,
        js,
        extractedTitle,
        extractedDescription,
        wasFullDocument: true,
        warnings,
    };
}

const SLUG_MAX_LEN = 80;

/** Twin of aidream's `_slugify` (promote.py) — same output for the same title. */
export function slugifyTitle(value: string): string {
    let s = (value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    s = s.slice(0, SLUG_MAX_LEN).replace(/-+$/g, "");
    return s || "page";
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
