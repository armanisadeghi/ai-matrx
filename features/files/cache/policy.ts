/**
 * features/files/cache/policy.ts
 *
 * Per-MIME size policy for the IndexedDB tier. The in-memory LRU caches
 * everything (it's session-scoped and bounded by total bytes); IDB only
 * persists what's worth re-loading across page reloads.
 *
 * The defaults are conservative: cache the large, expensive-to-re-fetch
 * artifacts (PDFs, video posters, audio) and the small text-y assets
 * (markdown, JSON, code) that previewers consult repeatedly.
 *
 * Returned `false` means "do not write to IDB". Memory LRU still caches.
 */

interface MimePolicy {
  /** Match the entire mime prefix (e.g. `image/`, `application/`). */
  prefix?: string;
  /** Exact mime types to match (highest precedence). */
  exact?: string[];
  /** Max bytes per entry; oversize files skip IDB. */
  maxBytes: number;
}

const POLICIES: MimePolicy[] = [
  { prefix: "image/", maxBytes: 50 * 1024 * 1024 },
  { prefix: "audio/", maxBytes: 100 * 1024 * 1024 },
  // Videos cache only up to 50 MB by default. Larger videos rely on
  // native HTML5 streaming + server-side Range responses.
  { prefix: "video/", maxBytes: 50 * 1024 * 1024 },
  { exact: ["application/pdf"], maxBytes: 250 * 1024 * 1024 },
  {
    exact: [
      "application/zip",
      "application/x-zip-compressed",
      "application/x-tar",
      "application/gzip",
    ],
    maxBytes: 500 * 1024 * 1024,
  },
  {
    prefix: "text/",
    maxBytes: 10 * 1024 * 1024,
  },
  { exact: ["application/json", "application/xml"], maxBytes: 10 * 1024 * 1024 },
];

const FALLBACK_MAX_BYTES = 25 * 1024 * 1024;

export function shouldPersistInIdb(
  mimeType: string | null | undefined,
  byteSize: number,
): boolean {
  if (!mimeType || byteSize <= 0) return false;
  const normalized = mimeType.toLowerCase();
  for (const policy of POLICIES) {
    if (policy.exact?.includes(normalized)) {
      return byteSize <= policy.maxBytes;
    }
    if (policy.prefix && normalized.startsWith(policy.prefix)) {
      return byteSize <= policy.maxBytes;
    }
  }
  return byteSize <= FALLBACK_MAX_BYTES;
}
