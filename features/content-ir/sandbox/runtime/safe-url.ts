/**
 * safe-url — the render-time protocol allowlist for the kind sandbox frame.
 *
 * WHY THIS IS NOT A STRING RULE. The authoring gate
 * (`features/agent-apps/utils/component-source-gate.ts`) limits what a
 * component's SOURCE may say. It can never see a `javascript:` URL, because
 * that value does not live in the source — it arrives at render time inside
 * the kind instance's own data (`href={data.url}`). Five live component bodies
 * interpolate unvalidated instance data straight into an `<a href>` (DD-123
 * plan §5, V-23, 2026-09-12), so the only place the class can be closed is the
 * render layer: parse the URL, allow a named protocol, refuse everything else.
 *
 * Refusals are never silent (Law 4): the caller gets `null` and is expected to
 * render the value inert with a visible marker, never to quietly drop it.
 */

/** Protocols an `href` may carry. Relative URLs (no protocol) are allowed. */
export const SAFE_HREF_PROTOCOLS: readonly string[] = [
    "http:",
    "https:",
    "mailto:",
    "tel:",
];

/**
 * Protocols a `src` may carry. `data:` is allowed ONLY for images — a
 * `data:text/html` src is a document with script in it. `blob:` is the frame's
 * own object URLs. Both are what the frame's CSP `img-src data: blob:` admits.
 */
export const SAFE_SRC_PROTOCOLS: readonly string[] = [
    "http:",
    "https:",
    "blob:",
];

export type UrlSlot = "href" | "src";

/** Whitespace and C0/C1 control characters — how `java\nscript:` hides. */
const CONTROL_CHARS = /[\u0000-\u0020\u007f-\u009f]/g;

/**
 * Parse `value` and return it unchanged when its protocol is allowed for the
 * slot, or `null` when it must be refused. A relative URL (no protocol) is
 * always allowed — it cannot leave the frame's opaque origin.
 *
 * Never throws.
 */
export function safeUrl(value: unknown, slot: UrlSlot = "href"): string | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!raw) return null;

    const cleaned = raw.replace(CONTROL_CHARS, "");
    const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);

    if (!scheme) {
        // Relative (or protocol-relative `//host`, which inherits the frame's
        // opaque origin and therefore resolves to nothing reachable).
        return raw;
    }

    const protocol = `${scheme[1].toLowerCase()}:`;

    if (slot === "src") {
        if (protocol === "data:") {
            return /^data:image\/(png|jpeg|jpg|gif|webp|avif|svg\+xml)[;,]/i.test(
                cleaned,
            )
                ? raw
                : null;
        }
        return SAFE_SRC_PROTOCOLS.includes(protocol) ? raw : null;
    }

    return SAFE_HREF_PROTOCOLS.includes(protocol) ? raw : null;
}

/** True when `value` would be refused for the slot. */
export function isUnsafeUrl(value: unknown, slot: UrlSlot = "href"): boolean {
    return safeUrl(value, slot) === null;
}
