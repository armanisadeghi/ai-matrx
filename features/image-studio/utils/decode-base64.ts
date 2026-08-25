/**
 * features/image-studio/utils/decode-base64.ts
 *
 * Pure-browser base64 → Blob decoder for the Image Studio "From Base64" tool.
 *
 * Accepts either:
 *   - a full data URL:  `data:image/png;base64,iVBORw0KGgo...`
 *   - the bare base64 payload: `iVBORw0KGgo...`
 *
 * Detects the actual image MIME type by sniffing the first few bytes of the
 * decoded payload. We don't trust the data-URL prefix exclusively because
 * users routinely paste in mismatched headers (a `data:image/jpeg` prefix on
 * actual PNG bytes, etc.) — the magic-byte sniff is the source of truth, the
 * declared MIME is only used as a tie-breaker.
 *
 * Returns a discriminated union: `{ ok: true, ... }` for success or
 * `{ ok: false, error }` for any validation failure. Callers should never
 * have to reach for try/catch.
 */

export type DecodeResult =
  | {
      ok: true;
      /** Decoded image as a Blob — ready for `URL.createObjectURL` or upload. */
      blob: Blob;
      /** Sniffed MIME type. Always one of the supported image types below. */
      mimeType: SupportedMimeType;
      /** Raw byte length of the decoded image. */
      byteLength: number;
      /** Sensible default file extension matching the sniffed MIME. */
      extension: SupportedExtension;
      /**
       * MIME type as declared in the input data URL prefix, if any. Useful
       * to surface a "the prefix said X but the bytes are Y" warning.
       */
      declaredMimeType: string | null;
      /**
       * Whether the input arrived already wrapped as a `data:` URL. Just an
       * informational signal for the UI.
       */
      hadDataUrlPrefix: boolean;
    }
  | { ok: false; error: string };

export type SupportedMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/avif"
  | "image/bmp"
  | "image/x-icon"
  | "image/svg+xml";

export type SupportedExtension =
  | "png"
  | "jpg"
  | "gif"
  | "webp"
  | "avif"
  | "bmp"
  | "ico"
  | "svg";

const MIME_TO_EXT: Record<SupportedMimeType, SupportedExtension> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/svg+xml": "svg",
};

const DATA_URL_RE = /^data:([^;,]+)?(?:;charset=[^;,]+)?(?:;base64)?,(.*)$/i;

/**
 * Decode a string into an image Blob. The string may be a `data:` URL or
 * raw base64. Whitespace and line breaks are stripped before decoding so
 * pasted multi-line payloads (typical of `--data-raw` curl output) work.
 */
export function decodeBase64Image(rawInput: string): DecodeResult {
  const input = rawInput.trim();
  if (!input) {
    return { ok: false, error: "Paste a base64 string to get started." };
  }

  let payload = input;
  let declaredMimeType: string | null = null;
  let hadDataUrlPrefix = false;

  const dataUrlMatch = input.match(DATA_URL_RE);
  if (dataUrlMatch) {
    declaredMimeType = (dataUrlMatch[1] ?? "").toLowerCase() || null;
    payload = dataUrlMatch[2] ?? "";
    hadDataUrlPrefix = true;
  } else if (input.toLowerCase().startsWith("data:")) {
    return {
      ok: false,
      error:
        "Looks like a data URL but I couldn't parse it. Make sure it includes the `,` separator after `;base64`.",
    };
  }

  // Strip every flavour of whitespace, newline, tab — copy-pasted base64 is
  // routinely line-wrapped to 64 / 76 columns.
  payload = payload.replace(/\s+/g, "");
  if (!payload) {
    return { ok: false, error: "No base64 data found after the prefix." };
  }

  // Quick alphabet validation. Standard alphabet, optional `=` padding.
  // We accept URL-safe alphabet too and normalize before decoding.
  const looksUrlSafe = /[-_]/.test(payload);
  if (looksUrlSafe) {
    payload = payload.replace(/-/g, "+").replace(/_/g, "/");
  }
  if (!/^[A-Za-z0-9+/]*=*$/.test(payload)) {
    return {
      ok: false,
      error:
        "That doesn't look like base64 — it contains characters outside the standard alphabet.",
    };
  }
  // Pad if needed (`atob` is strict).
  const padding = payload.length % 4;
  if (padding === 1) {
    return {
      ok: false,
      error: "Base64 length is invalid — the string appears to be truncated.",
    };
  }
  if (padding === 2) payload += "==";
  else if (padding === 3) payload += "=";

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(payload);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "decode failed";
    return { ok: false, error: `Could not decode base64: ${detail}` };
  }

  if (bytes.byteLength === 0) {
    return { ok: false, error: "Decoded payload is empty." };
  }

  const sniffed = sniffImageMime(bytes, declaredMimeType);
  if (!sniffed) {
    return {
      ok: false,
      error:
        "The decoded bytes don't match a supported image format (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, SVG).",
    };
  }

  const blob = new Blob([new Uint8Array(bytes)], { type: sniffed });

  return {
    ok: true,
    blob,
    mimeType: sniffed,
    byteLength: bytes.byteLength,
    extension: MIME_TO_EXT[sniffed],
    declaredMimeType,
    hadDataUrlPrefix,
  };
}

/**
 * Decode a base64 string into a Uint8Array. Uses the platform's `atob` —
 * fast, zero-dependency, and works in every modern browser.
 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Magic-byte sniffer. Recognizes every common raster format plus SVG
 * (text-based, sniffed via leading whitespace + `<svg` or `<?xml`).
 */
function sniffImageMime(
  bytes: Uint8Array,
  declared: string | null,
): SupportedMimeType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }

  // RIFF container (WebP): "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // ISO BMFF (AVIF / HEIC): bytes 4..7 = "ftyp", then a brand. We accept the
  // common AVIF brands ("avif", "avis"). HEIC/HEIF would also match here but
  // browsers can't decode them natively, so leave them unsupported.
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }

  // BMP: "BM"
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }

  // ICO: 00 00 01 00 (image type 1) or 00 00 02 00 (cursor type 2 — we accept
  // both since browsers render either as image).
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    (bytes[2] === 0x01 || bytes[2] === 0x02) &&
    bytes[3] === 0x00
  ) {
    return "image/x-icon";
  }

  // SVG (text). Look at the first 256 chars for `<svg` or `<?xml ... <svg`.
  // Only fall back to this when the declared MIME hints at SVG OR the bytes
  // are clearly UTF-8 text.
  const looksTextual = bytes
    .subarray(0, Math.min(bytes.length, 8))
    .every(
      (b) => b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b < 0x7f),
    );
  if (looksTextual) {
    const head = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.subarray(0, Math.min(bytes.length, 1024)))
      .trimStart()
      .toLowerCase();
    if (
      head.startsWith("<svg") ||
      (head.startsWith("<?xml") && head.includes("<svg"))
    ) {
      return "image/svg+xml";
    }
  }

  // Last-ditch: if the user declared a recognized MIME and the bytes weren't
  // obviously something else, trust the declaration. This keeps niche
  // formats working without us needing magic bytes for every one.
  if (declared && (declared as SupportedMimeType) in MIME_TO_EXT) {
    return declared as SupportedMimeType;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers for the UI.
// ---------------------------------------------------------------------------

/** Quick MIME → friendly format label for badge display. */
export function mimeTypeLabel(mime: SupportedMimeType): string {
  switch (mime) {
    case "image/png":
      return "PNG";
    case "image/jpeg":
      return "JPEG";
    case "image/gif":
      return "GIF";
    case "image/webp":
      return "WebP";
    case "image/avif":
      return "AVIF";
    case "image/bmp":
      return "BMP";
    case "image/x-icon":
      return "ICO";
    case "image/svg+xml":
      return "SVG";
  }
}

/**
 * Decode an image's natural width/height from a Blob. Returns null when the
 * browser can't decode (corrupted bytes, unsupported AVIF in old browsers).
 */
export async function decodeBlobDimensions(
  blob: Blob,
): Promise<{ width: number; height: number } | null> {
  try {
    const url = URL.createObjectURL(blob);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        URL.revokeObjectURL(url);
        resolve(w && h ? { width: w, height: h } : null);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}
