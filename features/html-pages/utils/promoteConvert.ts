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
 * body (a copy must not double the CSS), inline head scripts are preserved
 * into `js` (the `/c/` renderer injects `js_content` at body end), and
 * external head resources that cannot carry over are reported in `warnings`.
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

const HTML_OPEN_RE = /<html[\s>]|<html$/i;
const HEAD_OPEN_RE = /<head[\s>]|<head$/i;
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const BODY_RE = /<body[^>]*>([\s\S]*?)<\/body>/i;
const HEAD_RE = /<head[^>]*>([\s\S]*?)<\/head>/i;
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
// Mirrors the /p/ renderer's extractor: name before content, single/double quotes.
const META_DESC_RE =
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i;
const SCRIPT_BLOCK_RE = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i;
const LINK_STYLESHEET_RE = /<link\b(?=[^>]*\brel\s*=\s*["']?stylesheet["']?)[^>]*>/gi;
const HREF_ATTR_RE = /\bhref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i;

function unquote(attrValue: string): string {
    const v = attrValue.trim();
    if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
        return v.slice(1, -1);
    }
    return v;
}

function firstGroup(pattern: RegExp, html: string): string | null {
    const m = pattern.exec(html);
    return m ? m[1].trim() : null;
}

export function isFullDocument(html: string): boolean {
    return HTML_OPEN_RE.test(html) && HEAD_OPEN_RE.test(html);
}

/** Never throws on malformed input — worst case the whole content passes through. */
export function splitHtmlDocument(rawHtml: string | null | undefined): HtmlConversion {
    const html = rawHtml ?? "";
    const warnings: string[] = [];

    const extractedTitle = firstGroup(TITLE_RE, html);
    const extractedDescription = firstGroup(META_DESC_RE, html);

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
    const styleBlocks: string[] = [];
    for (const m of html.matchAll(STYLE_BLOCK_RE)) {
        const block = m[1].trim();
        if (block) styleBlocks.push(block);
    }
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
        body = body.replace(STYLE_BLOCK_RE, "");
    }

    // Divergences 2 + 3: preserve inline head scripts; warn on external head resources.
    const headMatch = HEAD_RE.exec(html);
    const jsParts: string[] = [];
    if (headMatch) {
        const head = headMatch[1];
        for (const m of head.matchAll(SCRIPT_BLOCK_RE)) {
            const attrs = m[1] ?? "";
            const scriptBody = m[2].trim();
            const src = SRC_ATTR_RE.exec(attrs);
            if (src) {
                warnings.push(`dropped external head script: ${unquote(src[1])}`);
            } else if (scriptBody) {
                jsParts.push(scriptBody);
            }
        }
        for (const m of head.matchAll(LINK_STYLESHEET_RE)) {
            const href = HREF_ATTR_RE.exec(m[0]);
            warnings.push(
                `dropped external head stylesheet: ${href ? unquote(href[1]) : "(no href)"}`,
            );
        }
    }
    const js = jsParts.length ? jsParts.join("\n\n") : null;

    return {
        body: body.trim(),
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
