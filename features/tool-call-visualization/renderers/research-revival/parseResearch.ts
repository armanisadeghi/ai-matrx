/**
 * parseResearch.ts — pure, typed parser for the web-research family
 * (`research_web` / `core_web_search` / `core_web_search_and_read`).
 *
 * The backend returns ONE text blob (not JSON). Shape:
 *
 *   Comprehensive research using the following queries: "q1", "q2", "q3".
 *
 *   # All Search Results:
 *
 *   Searched: "q1" (24), "q2" (21), "q3" (0)
 *
 *   ---
 *   ## "q1" (24 results)
 *
 *   Title: Some Page Title (April 10, 2026)
 *   URL: https://example.com/path
 *   <optional snippet line(s)>
 *
 *   Title: Another Title (1 day ago)
 *   URL: https://www.nih.gov/...
 *
 *   ---
 *   ## "q2" (21 results)
 *   ...
 *
 * Deep-read tools additionally embed `<read_result>...</read_result>` blocks
 * with fetched page content (Url / Title / Read At / Text).
 *
 * Everything here is best-effort and tolerant of missing pieces — a partial
 * or malformed blob yields whatever could be extracted, never throws.
 */

export interface ResearchResult {
    title: string;
    url: string;
    date?: string;
    snippet?: string;
}

export interface ResearchGroup {
    /** The search query this group of results belongs to. */
    query: string;
    /** Result count as reported by the server header (`## "q" (N results)`). */
    count: number;
    results: ResearchResult[];
}

export interface ResearchRead {
    url: string;
    title?: string;
    text: string;
}

export interface ParsedResearch {
    /** Queries named in the preamble line, in order. */
    preambleQueries: string[];
    /** One entry per `## "query" (N results)` section. */
    groups: ResearchGroup[];
    /** Fetched page content from `<read_result>` blocks (deep-read tools). */
    reads: ResearchRead[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Hostname without leading `www.`, or the raw string when unparseable. */
export function getDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

/** Google favicon endpoint for a URL's host; empty string when unparseable. */
export function getFaviconUrl(url: string, size = 32): string {
    try {
        const hostname = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`;
    } catch {
        return "";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section extractors
// ─────────────────────────────────────────────────────────────────────────────

/** Queries from `... queries: "q1", "q2", "q3".` (first such line wins). */
function parsePreambleQueries(text: string): string[] {
    // Match the preamble line up to the `# All Search Results` marker if present.
    const head = text.split(/^#\s+All Search Results/m)[0] ?? text;
    const quoted = head.match(/"([^"]+)"/g);
    if (!quoted) return [];
    // De-dupe while preserving order.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const q of quoted) {
        const clean = q.slice(1, -1).trim();
        if (clean && !seen.has(clean)) {
            seen.add(clean);
            out.push(clean);
        }
    }
    return out;
}

/**
 * Parse the individual results inside one `## "query" (N)` section body.
 * Each result is a `Title:` line (optionally with a trailing `(date)`),
 * a `URL:` line, and any number of following non-marker lines as snippet.
 */
function parseGroupResults(body: string): ResearchResult[] {
    const results: ResearchResult[] = [];
    // Split on each `Title:` boundary (keep the keyword via lookahead).
    const chunks = body.split(/\n(?=Title:\s)/);
    for (const chunk of chunks) {
        const titleMatch = chunk.match(/^Title:\s*(.+?)\s*$/m);
        const urlMatch = chunk.match(/^URL:\s*(\S+)\s*$/im);
        if (!titleMatch || !urlMatch) continue;

        let title = titleMatch[1].trim();
        let date: string | undefined;
        // Trailing `(date)` on the title line — e.g. "Foo Bar (April 10, 2026)".
        const dateMatch = title.match(/\s*\(([^()]+)\)\s*$/);
        if (dateMatch) {
            date = dateMatch[1].trim();
            title = title.slice(0, dateMatch.index).trim();
        }

        const url = urlMatch[1].trim();

        // Snippet = lines after the URL line, until the next blank/marker.
        const lines = chunk.split("\n");
        const urlLineIdx = lines.findIndex((l) => /^URL:\s*/i.test(l));
        const snippetLines: string[] = [];
        if (urlLineIdx >= 0) {
            for (let i = urlLineIdx + 1; i < lines.length; i++) {
                const raw = lines[i];
                const trimmed = raw.trim();
                if (!trimmed) break;
                if (/^(Title:|URL:|##|---|#\s)/i.test(trimmed)) break;
                snippetLines.push(trimmed);
            }
        }
        const snippet = snippetLines.join(" ").trim();

        results.push({
            title: title || getDomain(url),
            url,
            ...(date ? { date } : {}),
            ...(snippet ? { snippet } : {}),
        });
    }
    return results;
}

/** All `## "query" (N results)` sections → groups. */
function parseGroups(text: string): ResearchGroup[] {
    const groups: ResearchGroup[] = [];
    // A header line: `## "query" (24 results)` or `## "query" (24)`.
    const headerRe = /^##\s+"([^"]+)"\s*\((\d+)(?:\s+results?)?\)\s*$/gim;
    const headers: Array<{ query: string; count: number; index: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = headerRe.exec(text)) !== null) {
        headers.push({
            query: m[1].trim(),
            count: Number.parseInt(m[2], 10) || 0,
            index: m.index,
            end: m.index + m[0].length,
        });
    }

    for (let i = 0; i < headers.length; i++) {
        const cur = headers[i];
        const next = headers[i + 1];
        // Body runs from end-of-header to the next header (or EOF). Strip a
        // trailing `<read_result>` region so reads don't leak into snippets.
        let body = text.slice(cur.end, next ? next.index : text.length);
        const readIdx = body.indexOf("<read_result>");
        if (readIdx >= 0) body = body.slice(0, readIdx);
        // Drop horizontal rules used as section separators.
        body = body.replace(/^---\s*$/gm, "");
        groups.push({
            query: cur.query,
            count: cur.count,
            results: parseGroupResults(body),
        });
    }
    return groups;
}

/** `<read_result>...</read_result>` blocks → fetched page content. */
function parseReads(text: string): ResearchRead[] {
    const reads: ResearchRead[] = [];
    const blockRe = /<read_result>([\s\S]*?)<\/read_result>/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(text)) !== null) {
        const block = m[1];
        const url = block.match(/^\s*Url:\s*(.+)$/im)?.[1]?.trim() ?? "";
        const title = block.match(/^\s*Title:\s*(.+)$/im)?.[1]?.trim();
        // Text: everything after the `Text:` marker.
        const textMatch = block.match(/^\s*Text:\s*\n?([\s\S]*)$/im);
        const body = textMatch?.[1]?.trim() ?? "";
        if (url || title || body) {
            reads.push({
                url,
                ...(title ? { title } : {}),
                text: body,
            });
        }
    }
    return reads;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a web-research text blob into structured, typed groups + reads. */
export function parseResearch(text: string | null | undefined): ParsedResearch {
    if (!text || typeof text !== "string") {
        return { preambleQueries: [], groups: [], reads: [] };
    }
    return {
        preambleQueries: parsePreambleQueries(text),
        groups: parseGroups(text),
        reads: parseReads(text),
    };
}

/** Flatten every result across all groups (de-duped by URL, order preserved). */
export function flattenSources(parsed: ParsedResearch): ResearchResult[] {
    const seen = new Set<string>();
    const out: ResearchResult[] = [];
    for (const group of parsed.groups) {
        for (const r of group.results) {
            const key = r.url || `${group.query}:${r.title}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(r);
        }
    }
    return out;
}
