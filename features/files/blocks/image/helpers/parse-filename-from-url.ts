/**
 * features/files/blocks/image/helpers/parse-filename-from-url.ts
 *
 * S3 signed URLs the backend mints for AI-generated images carry the
 * intended filename in `response-content-disposition`, e.g.:
 *
 *   ?response-content-disposition=inline%3B%20filename%3D%22kitten.png%22
 *
 * Python's AI-naming step (`features/ai/...`) writes a meaningful name
 * there based on the prompt, so the browser shows it on download. But
 * when we use `<a download="...">` we override that — we need the name
 * in `block.fileName` to pass it back.
 *
 * This helper extracts the filename from the query param if present.
 * Returns null on anything malformed so callers always get a string or
 * null (never an empty string).
 *
 * Handles both RFC 5987 forms:
 *   - `filename="kitten.png"` (quoted, ASCII)
 *   - `filename*=UTF-8''ki%CC%88tten.png` (extended, percent-encoded)
 */

const FILENAME_QUERY_KEYS = [
  "response-content-disposition",
  "content-disposition",
];

export function parseFilenameFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  for (const key of FILENAME_QUERY_KEYS) {
    const disposition = parsed.searchParams.get(key);
    if (disposition) {
      const name = parseContentDisposition(disposition);
      if (name) return name;
    }
  }

  return null;
}

/**
 * Parse a Content-Disposition header value and return the filename.
 * RFC 6266 / 5987 — handles both `filename=` and `filename*=` forms.
 */
function parseContentDisposition(value: string): string | null {
  // RFC 5987 extended form: filename*=UTF-8''<percent-encoded>
  // Prefer this over the ASCII form when present (it can carry unicode).
  const extMatch =
    /filename\*\s*=\s*([A-Za-z0-9_-]+)'(?:[A-Za-z0-9_-]*)'([^;]+)/i.exec(value);
  if (extMatch) {
    const charset = extMatch[1];
    const encoded = extMatch[2].trim();
    try {
      const decoded = decodeURIComponent(encoded);
      if (charset.toLowerCase() === "utf-8") return safeName(decoded);
      return safeName(decoded);
    } catch {
      // fall through to the basic form
    }
  }

  // Basic form: filename="kitten.png"  OR  filename=kitten.png
  const basicMatch = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(value);
  if (basicMatch) {
    const raw = (basicMatch[1] ?? basicMatch[2] ?? "").trim();
    if (raw) return safeName(raw);
  }

  return null;
}

/**
 * Strip path traversal characters from a filename — defense-in-depth in
 * case the URL was crafted to inject a path. Result is just the leaf.
 */
function safeName(name: string): string | null {
  // Take only the leaf (no directory separators).
  const leaf = name.split(/[/\\]/).pop()?.trim();
  if (!leaf) return null;
  // Reject control characters and obviously broken values.
  if (/[\x00-\x1f]/.test(leaf)) return null;
  return leaf;
}
