/**
 * Saved images arrive in the frame as their BYTES (the host fetched them with
 * the reader's authorization; the frame can reach no file host). This turns
 * every Blob in a value (nested up to five levels) into a frame-local `blob:`
 * URL — the CSP allows `blob:` — so a component renders `itemState.<key>.src`
 * exactly as it would in the page. One URL per Blob for the frame's lifetime.
 */
export function makeBlobUrlMapper(
    createObjectURL: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
): (value: unknown) => unknown {
    const urls = new WeakMap<Blob, string>();
    const walk = (value: unknown, depth: number): unknown => {
        if (typeof Blob !== "undefined" && value instanceof Blob) {
            let url = urls.get(value);
            if (!url) {
                url = createObjectURL(value);
                urls.set(value, url);
            }
            return url;
        }
        if (depth > 4 || !value || typeof value !== "object") return value;
        if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) out[k] = walk(v, depth + 1);
        return out;
    };
    return (value) => walk(value, 0);
}
