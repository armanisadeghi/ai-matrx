// Legacy brand hosts (Vercel domains on the ai-matrx project) that must never
// serve pages. appmatrx.com answered 200 with the full site and no page named
// a canonical, so Google chose it as our home: a search for "AI Matrx" showed
// appmatrx.com. Every page request on these hosts moves to the main host.
//
// /api is outside the proxy matcher, so MCP clients still configured with an
// appmatrx.com URL keep working — a cross-origin redirect would drop their
// Authorization header.
export const LEGACY_BRAND_HOSTS: ReadonlySet<string> = new Set([
  "appmatrx.com",
  "www.appmatrx.com",
]);

/** The main-host URL a legacy-host request belongs at, or null to serve it. */
export function legacyBrandRedirectUrl(
  host: string | null,
  pathname: string,
  search: string,
  mainHost: string,
): URL | null {
  if (!host || !LEGACY_BRAND_HOSTS.has(host.toLowerCase())) return null;
  return new URL(pathname + search, `https://${mainHost}`);
}
