/**
 * Convert a public third-party image URL into the same-origin, SSRF-guarded
 * image proxy route. Brand-library rows can outlive a provider's hotlink/CORS
 * policy, so browser-direct loading is not reliable evidence that the asset is
 * renderable. The proxy deliberately remains a rendering fallback rather than
 * pretending the external bytes are an owned `files.files` row.
 */
export function proxiedExternalImageUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
