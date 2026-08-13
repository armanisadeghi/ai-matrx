import type { ScraperResult } from "@/features/scraper/hooks/useScraperApi";

export function contentLength(r: ScraperResult): number {
  return r.textContent?.length ?? (r.overview?.char_count as number) ?? 0;
}

export function sortByContent(results: ScraperResult[]): ScraperResult[] {
  return [...results].sort((a, b) => contentLength(b) - contentLength(a));
}

export function formatCharCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * THE scrape-target URL rule: normalize a typed target to something the
 * scraper endpoints can actually fetch, or `null` when it is not a web
 * address. A bare host gets `https://` — the same courtesy the user's typing
 * has always had.
 *
 * The two explicit checks below are not belt-and-braces. `new URL()` alone is
 * ENGINE-DEPENDENT at exactly the inputs that matter: Chromium accepts
 * `new URL("https://not a url at all")` (host `not`, spaces folded into the
 * path) where Node rejects it, so a `try/catch` around the constructor passed
 * obvious garbage in the only environment this code actually runs in. That was
 * visible from an agent run — writing `{ url: "not a url at all" }` through
 * the `scrape_command` write target returned `ok: true` and dropped
 * `https://not a url at all` into the box for the user to clear.
 *
 * So the host must be a real web host — dotted (`example.com`, an IP) or
 * `localhost` — and the scheme must be http/https. That also rejects the
 * non-web schemes the old version silently mangled: `file:///etc/passwd`
 * became `https://file:///etc/passwd` (host `file`), a string that parses but
 * can only ever come back as a backend error. Rejecting here is the same
 * verdict one HTTP round-trip later, delivered before anything is spent.
 *
 * Shared deliberately: the Scrape buttons and the surface's `scrape_command`
 * write handler both call this, so an agent can never stage a URL the user's
 * own click would have refused.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const host = parsed.hostname;
    if (!host) return null;
    if (host !== "localhost" && !host.includes(".")) return null;
    return withProtocol;
  } catch {
    return null;
  }
}
