/** A missing/garbled size reads "—", never a confident "0 B" (media 0.4.0). */
export function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDimensions(w: number | null, h: number | null): string {
    if (w == null || h == null) return "—";
    return `${w.toLocaleString()} × ${h.toLocaleString()}`;
}
