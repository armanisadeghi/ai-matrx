/** One ZIP code's count on the heatmap. Lives here, not in page.tsx: only a route imports a page. */
export interface ZipCodeData {
    zipCode: string;
    count: number;
    displayLabel?: string; // For aggregated views
    originalId?: string; // For aggregated views (e.g., ZIP-3 prefix)
}
