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

/**
 * A downloadable, non-media file (docx / pptx / xlsx / pdf / zip / …).
 * Carries whatever the tool handed us; the renderer resolves a live URL from
 * `file_id` (self-healing, like images) and falls back to `download_url`/`url`.
 */
export interface ResultFileRef {
    file_id?: string;
    mime_type?: string;
    file_name?: string;
    byte_size?: number;
    url?: string;
    download_url?: string;
}

export type ResultShape =
    | { kind: "empty" }
    | { kind: "scalar"; value: string | number | boolean; type: "string" | "number" | "boolean" }
    | { kind: "text"; value: string; markdown: boolean }
    | { kind: "uuid"; value: string }
    | { kind: "url"; value: string }
    | { kind: "media"; ref: MediaRef; alt?: string }
    /** A non-media file (document, spreadsheet, archive) — rendered as a download card. */
    | { kind: "file"; file: ResultFileRef }
    | { kind: "list"; items: Array<string | number | boolean | null> }
    /** An array that is entirely UUIDs — NEVER listed out; rendered as a count + copy-all. */
    | { kind: "idList"; ids: string[] }
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
/** Any image/video/audio extension — used to distinguish media from documents. */
const MEDIA_EXT_RE =
    /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|mp4|webm|mov|m4v|ogv|mp3|wav|ogg|m4a|flac|aac)(\?[^\s]*)?$/i;
/** True when a mime string names image/video/audio (the only "media" families). */
function isMediaMime(mime: string): boolean {
    return /^(image|video|audio)\//i.test(mime.trim());
}

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A whole-string RFC-4122 UUID (rendered compactly with hover-to-copy). */
export function looksLikeUuid(s: string): boolean {
    return UUID_RE.test(s);
}

/**
 * "SklSkillType.REFERENCE" → "Reference"; "Enum.RENDER_BLOCK" → "Render block".
 * Recognizes dotted enum-repr strings whose LAST segment is CONSTANT_CASE and
 * returns the human form (full original belongs in a `title` attr). Returns
 * null for anything else — callers fall through to the raw string.
 */
export function humanizeEnumValue(value: string): string | null {
    if (!/^[A-Za-z][\w]*(?:\.[A-Za-z0-9_]+)+$/.test(value)) return null;
    const tail = value.split(".").pop() as string;
    if (!/^[A-Z][A-Z0-9_]*$/.test(tail)) return null;
    const lowered = tail.toLowerCase().replace(/_/g, " ");
    return lowered.charAt(0).toUpperCase() + lowered.slice(1);
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

/** Read a string property from the first matching key, trimmed & non-empty. */
function readStringKey(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const v = obj[key];
        if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
    return undefined;
}

const MIME_KEYS = ["mime_type", "media_type", "mime"] as const;
const FILE_NAME_KEYS = ["file_name", "fileName", "filename", "name"] as const;
const DOWNLOAD_KEYS = ["download_url", "downloadUrl"] as const;
const FILE_URL_KEYS = ["url", "signed_url", "signedUrl", "cdn_url", "cdnUrl", "href"] as const;

/**
 * Detect a MEDIA-bearing value (image / video / audio only) and return a
 * {@link MediaRef} for `<InlineMediaRef>`, else null. Recognizes:
 *   - a data: URI string
 *   - an image-extension URL string
 *   - an object with `{file_id|fileId}` (owned file) whose mime/extension is
 *     image/video/audio — OR carries NO type signal at all (historical default:
 *     a bare owned file is treated as an image; non-media docs carry a mime and
 *     route to {@link coerceFileRef} instead)
 *   - an object with a url-ish key when it looks like a media URL or carries an
 *     image/video/audio mime hint
 *
 * NOTE: plain (non-image) http URLs are intentionally NOT media — those render
 * as a `UrlChip`. A file with a document/archive mime is NOT media — it routes
 * to {@link coerceFileRef}. Only call this when you actually want media detection.
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
    const mimeHint = readStringKey(obj, MIME_KEYS);

    // Owned-file reference wins — but only as MEDIA when the type says so.
    const fileId = obj.file_id ?? obj.fileId;
    if (typeof fileId === "string" && fileId.length > 0) {
        if (mimeHint) {
            // Explicit type: media only for image/video/audio; a docx/pdf/etc.
            // mime is NOT media (falls through to coerceFileRef → download card).
            if (!isMediaMime(mimeHint)) return null;
            return { file_id: fileId, mime_type: mimeHint };
        }
        // No mime. Infer from a filename/url extension when present.
        const probe = [readStringKey(obj, FILE_NAME_KEYS), readStringKey(obj, [...FILE_URL_KEYS, ...DOWNLOAD_KEYS])]
            .filter(Boolean)
            .join(" ");
        if (MEDIA_EXT_RE.test(probe)) return { file_id: fileId };
        if (/\.[a-z0-9]{1,5}(\?[^\s]*)?(\s|$)/i.test(probe)) return null; // a non-media extension → file
        // Zero type signal → historical default: treat a bare owned file as an image.
        return { file_id: fileId };
    }

    const hasMediaMimeHint = mimeHint !== undefined && isMediaMime(mimeHint);

    for (const key of MEDIA_KEYS) {
        const candidate = obj[key];
        if (typeof candidate !== "string") continue;
        const s = candidate.trim();
        const isData = DATA_URI_RE.test(s);
        if (isData || looksLikeImageUrl(s) || (hasMediaMimeHint && looksLikeUrl(s))) {
            const ref: MediaRef = { url: s };
            if (mimeHint !== undefined) ref.mime_type = mimeHint;
            return ref;
        }
    }

    return null;
}

/**
 * Detect a NON-media file reference (document / spreadsheet / archive / any
 * `file_id`-or-`download_url`-bearing object whose mime is NOT image/video/
 * audio) and return a {@link ResultFileRef}, else null. This is the sibling of
 * {@link coerceMediaRef}: call it AFTER media detection fails so a docx/pptx/
 * xlsx/pdf renders as a download card instead of a broken `<img>`.
 *
 * Conservative on purpose — a plain object that merely has a `url` field (a
 * search result, a link) is NOT a file. We require one of:
 *   - a `file_id`, OR
 *   - a `download_url`, OR
 *   - a `url` accompanied by an explicit (non-media) mime hint.
 */
export function coerceFileRef(value: unknown): ResultFileRef | null {
    if (!isPlainObject(value)) return null;
    const obj = value;

    const mime = readStringKey(obj, MIME_KEYS);
    // A media mime is handled by coerceMediaRef, never here.
    if (mime !== undefined && isMediaMime(mime)) return null;

    const fileId = typeof obj.file_id === "string" && obj.file_id.length > 0
        ? obj.file_id
        : typeof obj.fileId === "string" && obj.fileId.length > 0
          ? obj.fileId
          : undefined;

    const downloadRaw = readStringKey(obj, DOWNLOAD_KEYS);
    const downloadUrl = downloadRaw && looksLikeUrl(downloadRaw) ? downloadRaw : undefined;
    const urlRaw = readStringKey(obj, FILE_URL_KEYS);
    const url = urlRaw && looksLikeUrl(urlRaw) ? urlRaw : undefined;

    const hasFileSignal = Boolean(fileId) || Boolean(downloadUrl) || (Boolean(url) && mime !== undefined);
    if (!hasFileSignal) return null;

    const ref: ResultFileRef = {};
    if (fileId) ref.file_id = fileId;
    if (mime !== undefined) ref.mime_type = mime;
    const fileName = readStringKey(obj, FILE_NAME_KEYS);
    if (fileName) ref.file_name = fileName;
    const sizeRaw = obj.byte_size ?? obj.byteSize ?? obj.file_size ?? obj.fileSize ?? obj.size;
    if (typeof sizeRaw === "number" && Number.isFinite(sizeRaw) && sizeRaw >= 0) ref.byte_size = sizeRaw;
    if (url) ref.url = url;
    if (downloadUrl) ref.download_url = downloadUrl;
    return ref;
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

    // 2b. Non-media file (object form) — a docx/pptx/xlsx/pdf/zip payload with a
    //     file_id/download_url. Check before generic object so it renders as a
    //     download card, not a key/value grid (and never a broken <img>).
    const objectFile = isPlainObject(value) ? coerceFileRef(value) : null;
    if (objectFile) {
        return { kind: "file", file: objectFile };
    }

    // 3. Strings: media URI → uuid → url → markdown text → plain scalar/text.
    if (typeof value === "string") {
        const stringMedia = coerceMediaRef(value);
        if (stringMedia) return { kind: "media", ref: stringMedia };
        if (looksLikeUuid(value)) return { kind: "uuid", value };
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
            // Every item a UUID → a wall of ids conveys nothing in a chat.
            // Render as a count + copy-all chip instead (owner rule: never
            // show a user a list of raw UUIDs).
            if (value.every((v) => typeof v === "string" && looksLikeUuid(v))) {
                return { kind: "idList", ids: value as string[] };
            }
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
