/**
 * parseSearch — the ONE canonical parser for the web-search / research family
 * (`web_search`, `core_web_search`, `web_search_v1`, `research_web`,
 * `core_web_search_and_read`, `news_get_headlines`).
 *
 * This consolidates the three formerly-duplicated `parseResearch.ts` parsers
 * (research-modern + research-revival) and the deep-research `parser.ts` into a
 * single tolerant parser. Every search renderer in the codebase consumes this.
 *
 * ─── The wire reality (verified from the DB) ─────────────────────────────────
 *
 * These tools all emit a single TEXT blob (headlines emit JSON). The blob is
 * NOT token-streamed — it arrives WHOLE at `tool_completed`. Shape:
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
 *   Description: ...
 *   Extra Snippets: ...
 *
 *   Title: Another Title (1 day ago)
 *   URL: https://www.nih.gov/...
 *   ...
 *
 * Deep-read tools additionally embed fetched page content as:
 *
 *   <read_result>
 *   url: https://...
 *   title: ...
 *   <page text…>
 *   </read_result>
 *
 * The parser walks the text, recognizes the pieces it knows, and silently skips
 * the rest. Missing pieces yield empty arrays — it NEVER throws, and it is
 * robust to zero queries / any query count / a partial mid-stream blob.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

/** A single search hit under one query. */
export interface SearchResult {
    title: string;
    url: string;
    /** Trailing "(date)" parsed from the title line, e.g. "1 day ago". */
    date?: string;
    /** Description / Extra Snippets / freeform snippet lines, joined. */
    snippet?: string;
}

/** One query and the hits returned for it. */
export interface SearchGroup {
    query: string;
    /** Reported count from the header (may exceed `results.length`). */
    count: number;
    results: SearchResult[];
}

/** A page whose full content a deep-read tool actually fetched. */
export interface SearchRead {
    url: string;
    title?: string;
    text: string;
}

/** A base-URL-deduped, domain-stamped source row for the unified ranked list. */
export interface SearchSource {
    title: string;
    url: string;
    domain: string;
    date?: string;
    snippet?: string;
}

export interface ParsedSearch {
    /** All queries, in order — from the "Searched:" line or group headers. */
    queries: string[];
    /** Per-query result groups (each group de-duped by base URL internally). */
    groups: SearchGroup[];
    /** Pages whose full content was fetched (deep reads). */
    reads: SearchRead[];
    /** Every source, de-duplicated by BASE URL, with domain stamped + ranked. */
    sources: SearchSource[];
    /** Distinct domains with their source counts, ranked desc by count. */
    domains: Array<{ domain: string; count: number }>;
    /** Total reported result count across all query headers. */
    totalReported: number;
    /**
     * A synthesized AI answer / summary when one is present in the blob (the
     * "# Curated Research Results" section that the research sub-agent writes).
     * `null` for plain search (no summary) → the renderer leads with results.
     */
    report: string | null;
}

/** A single headline article from `news_get_headlines`. */
export interface HeadlineArticle {
    title: string;
    url: string;
    source?: string;
    publishedAt?: string;
    description?: string;
    imageUrl?: string;
}

export interface ParsedHeadlines {
    articles: HeadlineArticle[];
    totalResults: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL helpers — the canonical favicon / domain / base-URL-dedupe utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Hostname without leading `www.`, or a best-effort slice when unparseable. */
export function getDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        const stripped = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
        const slash = stripped.indexOf("/");
        return slash === -1 ? stripped : stripped.slice(0, slash);
    }
}

/** Google favicon endpoint for a URL's host; empty string when unparseable. */
export function getFaviconUrl(url: string, size = 32): string {
    const domain = getDomain(url);
    if (!domain) return "";
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

/**
 * The canonical base-URL dedupe key for a result.
 *
 * Base URL = scheme + host (www-stripped) + pathname, WITHOUT query string or
 * fragment. So `example.com/article?utm=a` and `example.com/article?utm=b`
 * collapse to one source — a real search engine never lists the same page
 * twice just because the tracking params differ. Falls back to the raw,
 * lower-cased string (minus a trailing slash) when the URL won't parse.
 */
export function baseUrlKey(url: string): string {
    if (!url) return "";
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, "");
        const path = u.pathname.replace(/\/+$/, "");
        return `${host}${path}`.toLowerCase();
    } catch {
        return url.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
    }
}

/**
 * De-duplicate a list of result-like items by their BASE URL, preserving order
 * (the first occurrence wins). Generic over anything carrying a `url`.
 */
export function dedupeByBaseUrl<T extends { url: string }>(items: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
        const key = baseUrlKey(item.url);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

/** Format an ISO date / freeform date string for compact display. */
export function formatDate(value: string | undefined): string | undefined {
    if (!value) return undefined;
    // Already-relative ("1 day ago") or freeform — pass through.
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;
    return new Date(parsed).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-result extraction (deep-read tools)
// ─────────────────────────────────────────────────────────────────────────────

const READ_BLOCK_RE = /<read_result>([\s\S]*?)<\/read_result>/g;

/**
 * Pull every `<read_result>…</read_result>` block out of the raw text and
 * return both the parsed reads and the text with those blocks removed (so the
 * search-result parser doesn't trip over embedded page bodies).
 */
function extractReads(raw: string): { reads: SearchRead[]; rest: string } {
    const reads: SearchRead[] = [];
    let match: RegExpExecArray | null;
    READ_BLOCK_RE.lastIndex = 0;
    while ((match = READ_BLOCK_RE.exec(raw)) !== null) {
        const body = match[1];
        const url =
            body.match(/^\s*url\s*:\s*(.+)$/im)?.[1]?.trim() ??
            body.match(/^\s*URL\s*:\s*(.+)$/m)?.[1]?.trim() ??
            "";
        const title =
            body.match(/^\s*title\s*:\s*(.+)$/im)?.[1]?.trim() ?? undefined;

        // Everything after the url/title header lines is the page text.
        let text = body
            .replace(/^\s*url\s*:\s*.+$/im, "")
            .replace(/^\s*title\s*:\s*.+$/im, "")
            .trim();
        // Some variants prefix the body with "text:" or "content:".
        text = text.replace(/^\s*(?:text|content)\s*:\s*/i, "").trim();

        if (url || text) {
            reads.push({ url, title, text });
        }
    }
    const rest = raw.replace(READ_BLOCK_RE, "").trim();
    return { reads, rest };
}

// ─────────────────────────────────────────────────────────────────────────────
// Query / group parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Queries declared in the `Searched: "q1" (N), "q2" (N)` line. */
function parseSearchedLine(raw: string): string[] {
    const line = raw.match(/^Searched:\s*(.+)$/m)?.[1];
    if (!line) return [];
    const out: string[] = [];
    const re = /"([^"]+)"\s*\((\d+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) out.push(m[1]);
    return out;
}

/**
 * Parse a single result entry block into a {@link SearchResult}. Handles both
 * the rich form (Description: / Extra Snippets:) and the lean form (a freeform
 * snippet line directly after URL).
 */
function parseResultEntry(block: string): SearchResult | null {
    const titleLine = block.match(/^\s*Title:\s*(.+)$/m)?.[1]?.trim();
    const url = block.match(/^\s*URL:\s*(.+)$/im)?.[1]?.trim();
    if (!titleLine && !url) return null;

    // Trailing "(date)" on the title line.
    const dateMatch = titleLine?.match(/\(([^)]+)\)\s*$/);
    const date = dateMatch?.[1]?.trim();
    const title = (titleLine ?? url ?? "").replace(/\s*\([^)]+\)\s*$/, "").trim();

    const description = block.match(/^\s*Description:\s*(.+)$/m)?.[1]?.trim();
    const extra = block.match(/^\s*Extra Snippets:\s*(.+)$/m)?.[1]?.trim();

    let snippet = [description, extra].filter(Boolean).join(" — ");

    // Lean form: lines after URL that aren't recognized keyed fields.
    if (!snippet && url) {
        const lines = block.split("\n").map((l) => l.trim());
        const urlIdx = lines.findIndex((l) => /^URL:/i.test(l));
        if (urlIdx !== -1) {
            const tail = lines
                .slice(urlIdx + 1)
                .filter(
                    (l) =>
                        l.length > 0 &&
                        !/^(Title|URL|Description|Extra Snippets):/i.test(l),
                );
            snippet = tail.join(" ").trim();
        }
    }

    return {
        title: title || url || "Untitled",
        url: url ?? "",
        date,
        snippet: snippet || undefined,
    };
}

/**
 * Parse all per-query groups. Group headers look like:
 *   ## "query text" (24 results)
 * Followed by a run of `Title:/URL:/…` entries separated by blank lines. Each
 * group's results are de-duped by base URL so a group never lists a page twice.
 */
function parseGroups(raw: string): SearchGroup[] {
    const groups: SearchGroup[] = [];
    // Header: `## "query" (24 results)` or `## "query" (24)`.
    const headerRe = /^##\s+"([^"]+)"\s*\((\d+)(?:\s+results?)?\)\s*$/gim;

    const headers: Array<{
        query: string;
        count: number;
        index: number;
        headerLen: number;
    }> = [];
    let hm: RegExpExecArray | null;
    while ((hm = headerRe.exec(raw)) !== null) {
        headers.push({
            query: hm[1],
            count: parseInt(hm[2], 10) || 0,
            index: hm.index,
            headerLen: hm[0].length,
        });
    }

    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        const bodyStart = h.index + h.headerLen;
        const bodyEnd = i + 1 < headers.length ? headers[i + 1].index : raw.length;
        let body = raw.slice(bodyStart, bodyEnd);

        // Stop at the next top-level section / metrics / separator-only tail.
        body = body
            .replace(/\n#+\s+[\s\S]*$/, "")
            .replace(/\n---\s*\n\s*##[\s\S]*$/, "")
            .trim();

        const entries = body.split(/\n\s*\n(?=\s*Title:)/i);
        const results: SearchResult[] = [];
        for (const entry of entries) {
            if (!/Title:/i.test(entry) && !/URL:/i.test(entry)) continue;
            const parsed = parseResultEntry(entry);
            if (parsed) results.push(parsed);
        }

        groups.push({
            query: h.query,
            count: h.count || results.length,
            results: dedupeByBaseUrl(results),
        });
    }

    return groups;
}

/**
 * Extract the synthesized "# Curated Research Results" report when present.
 * Plain search blobs have no such section → returns null.
 */
function extractReport(raw: string): string | null {
    const CURATED = "# Curated Research Results";
    const NEXT_STEPS = "\n## Next steps:";
    const start = raw.indexOf(CURATED);
    if (start === -1) return null;
    const after = raw.slice(start + CURATED.length);
    const nsIdx = after.indexOf(NEXT_STEPS);
    const reportRaw = (nsIdx !== -1 ? after.slice(0, nsIdx) : after).trim();
    const report = reportRaw
        .replace(/^The following is the result of[^\n]*\n+/i, "")
        .trim();
    return report.length > 0 ? report : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: main parser
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_PARSED: ParsedSearch = {
    queries: [],
    groups: [],
    reads: [],
    sources: [],
    domains: [],
    totalReported: 0,
    report: null,
};

/**
 * Parse a search/research tool's text result into structured data. Always
 * returns a well-formed shape — empty arrays when nothing matched.
 */
export function parseSearch(raw: string | null | undefined): ParsedSearch {
    if (!raw || typeof raw !== "string") return EMPTY_PARSED;

    const { reads, rest } = extractReads(raw);
    const groups = parseGroups(rest);
    const report = extractReport(raw);

    // Queries: prefer the explicit "Searched:" line, fall back to group headers.
    const searchedQueries = parseSearchedLine(rest);
    const groupQueries = groups.map((g) => g.query);
    const queries = searchedQueries.length > 0 ? searchedQueries : groupQueries;
    for (const q of groupQueries) {
        if (!queries.includes(q)) queries.push(q);
    }

    // De-duplicate the unified source list by BASE URL, stamping domain. Reads
    // are sources too — append any not already listed.
    const flat: SearchSource[] = [];
    for (const group of groups) {
        for (const r of group.results) {
            if (!r.url) continue;
            flat.push({
                title: r.title,
                url: r.url,
                domain: getDomain(r.url),
                date: r.date,
                snippet: r.snippet,
            });
        }
    }
    for (const rd of reads) {
        if (!rd.url) continue;
        flat.push({
            title: rd.title ?? getDomain(rd.url),
            url: rd.url,
            domain: getDomain(rd.url),
            snippet: rd.text ? rd.text.slice(0, 240) : undefined,
        });
    }
    const sources = dedupeByBaseUrl(flat);

    // Domain coverage, ranked by count desc then name asc.
    const domainCounts = new Map<string, number>();
    for (const s of sources) {
        if (!s.domain) continue;
        domainCounts.set(s.domain, (domainCounts.get(s.domain) ?? 0) + 1);
    }
    const domains = Array.from(domainCounts.entries())
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));

    const totalReported = groups.reduce(
        (acc, g) => acc + (g.count || g.results.length),
        0,
    );

    return { queries, groups, reads, sources, domains, totalReported, report };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: headlines (JSON) parser
// ─────────────────────────────────────────────────────────────────────────────

interface RawHeadlineArticle {
    title?: unknown;
    url?: unknown;
    source?: unknown;
    publishedAt?: unknown;
    published_at?: unknown;
    description?: unknown;
    urlToImage?: unknown;
    url_to_image?: unknown;
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Normalize a possibly-nested `source` field to its display name. */
function sourceName(value: unknown): string | undefined {
    if (typeof value === "string") return value || undefined;
    if (value && typeof value === "object") {
        const name = (value as { name?: unknown }).name;
        return asString(name);
    }
    return undefined;
}

/**
 * Parse a `news_get_headlines` result object. Tolerates the camelCase wire
 * shape (`urlToImage`, `publishedAt`, `source.name`) AND the snake_case variant
 * (`url_to_image`, `published_at`).
 */
export function parseHeadlines(
    result: Record<string, unknown> | null | undefined,
): ParsedHeadlines {
    if (!result) return { articles: [], totalResults: 0 };

    const rawArticles = Array.isArray(result.articles)
        ? (result.articles as RawHeadlineArticle[])
        : [];

    const articles: HeadlineArticle[] = [];
    for (const a of rawArticles) {
        const title = asString(a.title);
        const url = asString(a.url);
        if (!title && !url) continue;
        articles.push({
            title: title ?? url ?? "Untitled",
            url: url ?? "",
            source: sourceName(a.source),
            publishedAt: asString(a.publishedAt) ?? asString(a.published_at),
            description: asString(a.description),
            imageUrl: asString(a.urlToImage) ?? asString(a.url_to_image),
        });
    }

    const totalResults =
        typeof result.total_results === "number"
            ? (result.total_results as number)
            : typeof result.totalResults === "number"
              ? (result.totalResults as number)
              : articles.length;

    return { articles, totalResults };
}
