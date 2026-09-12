export function formatDimensions(w: number | null, h: number | null): string {
    if (w == null || h == null) return "—";
    return `${w.toLocaleString()} × ${h.toLocaleString()}`;
}
