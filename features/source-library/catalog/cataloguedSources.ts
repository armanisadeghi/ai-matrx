/**
 * features/source-library/catalog/cataloguedSources.ts
 *
 * SOURCE-CONVERGENCE §2.6 — a Library files a Source by a
 * `processed_document → media_source_library` edge labelled
 * `catalogued_source`. Other edges from a document to a Library (none are
 * registered today) must never be listed as "filed here".
 */

export const CATALOGUED_SOURCE_LABEL = "catalogued_source";

/** Which Library adapters list their Sources from the edges, not the catalog read. */
export function listsCataloguedSources(adapter: string | null | undefined): boolean {
    return adapter === "web_capture";
}

/** The Source ids a Library's incoming `processed_document` links file there, deduped, in order. */
export function cataloguedSourceIds(
    links: readonly { resourceId: string; label: string | null }[],
): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const link of links) {
        if (link.label !== CATALOGUED_SOURCE_LABEL) continue;
        if (seen.has(link.resourceId)) continue;
        seen.add(link.resourceId);
        ids.push(link.resourceId);
    }
    return ids;
}
