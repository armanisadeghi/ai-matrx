/**
 * result-fields/shape.ts — the truth-teller.
 *
 * `detectResultShape` inspects an arbitrary tool result (`unknown`) and
 * classifies it into a discriminated `ResultShape`. The recursive
 * `<ResultValue>` renderer delegates on this discriminant, so EVERY heuristic
 * here is load-bearing for what a user sees. Keep them conservative: when in
 * doubt, fall through to `json` (the collapsible tree) — never guess a fancy
 * treatment that could hide or misrepresent data.
 *
 * Design rules:
 *  - No `any`. Operate on `unknown` and narrow explicitly.
 *  - Heuristics err toward HONESTY over prettiness. A wrong "markdown" guess
 *    that swallows characters is worse than plain text.
 *  - Every branch is reachable and documented.
 */

import type { MediaRef } from "@/features/files/types";

// ─── Discriminated union ────────────────────────────────────────────────────

/** A column descriptor derived from a uniform object array. */
export interface TableColumn {
    /** The object key this column reads. */
    key: string;
    /** Human label (key with separators normalized). */
    label: string;
}

export type ResultShape =
    | { kind: "empty" }
    | { kind: "scalar"; value: string | number | boolean; type: "string" | "number" | "boolean" }
    | { kind: "text"; value: string; markdown: boolean }
    | { kind: "url"; value: string }
    | { kind: "media"; ref: MediaRef; alt?: string }
    | { kind: "list"; items: Array<string | number | boolean | null> }
    | { kind: "table"; rows: Array<Record<string, unknown>>; columns: TableColumn[] }
    | { kind: "object"; value: Record<string, unknown> }
    | { kind: "json"; value: unknown };

// ─── Primitive guards ───────────────────────────────────────────────────────

/** A plain object: not null, not an array, not a Date/Map/Set/etc. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object") return false;
    if (Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value) as unknown;
    return proto === Object.prototype || proto === null;
}

function isScalar(value: unknown): value is string | number | boolean {
    const t = typeof value;
    return t === "string" || t === "number" || t === "boolean";
}

/** True when every item is a scalar or null (renders as a bullet list). */
function isScalarList(arr: unknown[]): arr is Array<string | number | boolean | null> {
    return arr.every((item) => item === null || isScalar(item));
}

// ─── Key / column helpers ───────────────────────────────────────────────────

/** Normalize a key like `total_results` / `totalResults` → "Total results". */
export function humanizeKey(key: string): string {
    const spaced = key
        .replace(/[_-]+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .trim();
    if (spaced.length === 0) return key;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Array of ≥1 plain objects → `columns` = ordered union of keys (first-seen
 * order across all rows). Returns null when the array is not a uniform object
 * array (so the caller can fall back to a list / json view).
 */
export function isUniformObjectArray(arr: unknown[]): TableColumn[] | null {
    if (arr.length === 0) return null;
    if (!arr.every((row) => isPlainObject(row))) return null;

    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const row of arr as Array<Record<string, unknown>>) {
        for (const key of Object.keys(row)) {
            if (!seen.has(key)) {
                seen.add(key);
                ordered.push(key);
            }
        }
    }
    // A "table" with zero columns is meaningless; treat as non-uniform.
    if (ordered.length === 0) return null;
    return ordered.map((key) => ({ key, label: humanizeKey(key) }));
}

// ─── URL / media heuristics ─────────────────────────────────────────────────

const URL_RE = /^https?:\/\/[^\s]+$/i;
const DATA_URI_RE = /^data:([a-z]+)\/[a-z0-9.+-]+(;base64)?,/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)(\?[^\s]*)?$/i;

/** A single, whole-string http(s) URL (no surrounding prose). */
export function looksLikeUrl(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length === 0 || /\s/.test(trimmed)) return false;
    return URL_RE.test(trimmed);
}

/** A URL whose path ends in a known image extension. */
export function looksLikeImageUrl(value: string): boolean {
    const trimmed = value.trim();
    if (!looksLikeUrl(trimmed)) return false;
    return IMAGE_EXT_RE.test(trimmed);
}

/**
 * Conservative markdown sniff. True when the string carries structural
 * markdown (headings, lists, links, code fences, blockquotes, tables, bold/
 * italic) OR is long enough (>280 chars) that prose formatting is worthwhile.
 * Plain short strings stay `scalar`/`text` with markdown=false.
 */
export function looksLikeMarkdown(value: string): boolean {
    if (value.length > 280) return true;
    const signals: RegExp[] = [
        /^#{1,6}\s+\S/m, // atx heading
        /^[-*+]\s+\S/m, // unordered list item
        /^\d+\.\s+\S/m, // ordered list item
        /^>\s+\S/m, // blockquote
        /```/, // fenced code
        /\[[^\]]+\]\([^)]+\)/, // [text](link)
        /!\[[^\]]*\]\([^)]+\)/, // image
        /\*\*[^*\n]+\*\*/, // bold
        /(^|\s)`[^`\n]+`/, // inline code
        /^\|.+\|.*$/m, // table row
        /^\s*[-*_]{3,}\s*$/m, // thematic break
    ];
    return signals.some((re) => re.test(value));
}

// ─── Media coercion ─────────────────────────────────────────────────────────

const MEDIA_KEYS = ["url", "src", "image_url", "imageUrl", "href", "link"] as const;

/**
 * Detect a media-bearing value and return a {@link MediaRef} for
 * `<InlineMediaRef>`, else null. Recognizes:
 *   - a data: URI string
 *   - an image-extension URL string
 *   - an object with `{file_id|fileId}` (owned file)
 *   - an object with a url-ish key (`url|src|image_url|...`) when it looks like
 *     an image URL or carries a `media_type|mime|mime_type` hint
 *
 * NOTE: plain (non-image) http URLs are intentionally NOT media — those render
 * as a `UrlChip`. Only call this when you actually want media detection.
 */
export function coerceMediaRef(value: unknown): MediaRef | null {
    // Bare string: data URI or image-extension URL.
    if (typeof value === "string") {
        const s = value.trim();
        if (DATA_URI_RE.test(s)) return { url: s };
        if (looksLikeImageUrl(s)) return { url: s };
        return null;
    }

    if (!isPlainObject(value)) return null;
    const obj = value;

    // Owned-file reference wins.
    const fileId = obj.file_id ?? obj.fileId;
    if (typeof fileId === "string" && fileId.length > 0) {
        const ref: MediaRef = { file_id: fileId };
        const mime = obj.mime_type ?? obj.media_type ?? obj.mime;
        if (typeof mime === "string") ref.mime_type = mime;
        return ref;
    }

    const mimeHint = obj.mime_type ?? obj.media_type ?? obj.mime;
    const hasMimeHint = typeof mimeHint === "string" && /^(image|video|audio)\b/i.test(mimeHint);

    for (const key of MEDIA_KEYS) {
        const candidate = obj[key];
        if (typeof candidate !== "string") continue;
        const s = candidate.trim();
        const isData = DATA_URI_RE.test(s);
        if (isData || looksLikeImageUrl(s) || (hasMimeHint && looksLikeUrl(s))) {
            const ref: MediaRef = { url: s };
            if (typeof mimeHint === "string") ref.mime_type = mimeHint;
            return ref;
        }
    }

    return null;
}

// ─── The classifier ─────────────────────────────────────────────────────────

/**
 * True when a string is "blank" for display purposes — empty or whitespace.
 */
function isBlankString(value: string): boolean {
    return value.trim().length === 0;
}

/**
 * Classify an arbitrary value into a `ResultShape`. Pure, synchronous, total —
 * every input lands on exactly one branch (worst case `json`).
 */
export function detectResultShape(value: unknown): ResultShape {
    // 1. Empty: null / undefined / "" / whitespace / [] / {}.
    if (value === null || value === undefined) return { kind: "empty" };
    if (typeof value === "string" && isBlankString(value)) return { kind: "empty" };
    if (Array.isArray(value) && value.length === 0) return { kind: "empty" };
    if (isPlainObject(value) && Object.keys(value).length === 0) return { kind: "empty" };

    // 2. Media (object form) — check before generic object so image payloads
    //    render as images, not key/value grids.
    const objectMedia = isPlainObject(value) ? coerceMediaRef(value) : null;
    if (objectMedia) {
        const alt =
            isPlainObject(value) && typeof value.alt === "string"
                ? value.alt
                : isPlainObject(value) && typeof value.title === "string"
                  ? value.title
                  : undefined;
        return { kind: "media", ref: objectMedia, alt };
    }

    // 3. Strings: media URI → url → markdown text → plain scalar/text.
    if (typeof value === "string") {
        const stringMedia = coerceMediaRef(value);
        if (stringMedia) return { kind: "media", ref: stringMedia };
        if (looksLikeUrl(value)) return { kind: "url", value: value.trim() };
        if (looksLikeMarkdown(value)) return { kind: "text", value, markdown: true };
        // Single-line, short, no markdown → scalar treatment.
        if (!value.includes("\n") && value.length <= 120) {
            return { kind: "scalar", value, type: "string" };
        }
        return { kind: "text", value, markdown: false };
    }

    // 4. Number / boolean scalars.
    if (typeof value === "number" || typeof value === "boolean") {
        return { kind: "scalar", value, type: typeof value === "number" ? "number" : "boolean" };
    }

    // 5. Arrays: uniform objects → table; all scalars → list; else json.
    if (Array.isArray(value)) {
        const columns = isUniformObjectArray(value);
        if (columns) {
            return { kind: "table", rows: value as Array<Record<string, unknown>>, columns };
        }
        if (isScalarList(value)) {
            return { kind: "list", items: value };
        }
        return { kind: "json", value };
    }

    // 6. Plain objects → key/value grid.
    if (isPlainObject(value)) {
        return { kind: "object", value };
    }

    // 7. Anything else (Date, Map, Set, functions, class instances) → json tree.
    return { kind: "json", value };
}
