/**
 * features/file-handler/intelligence/magic-bytes.ts
 *
 * MIME sniffing from the first ~16 bytes of a file. Used when a source
 * arrives with no Content-Type and no extension (rare but happens with
 * paste-from-clipboard, raw buffers, and stream events).
 *
 * The big eight image formats plus PDF cover ~99% of real input. Anything
 * else falls through to `application/octet-stream` and the resolver
 * defers to the file extension or the FILE_TYPES registry.
 */

const MAGIC_TABLE: Array<{
  mime: string;
  prefix: number[];
  offset?: number;
  match?: (bytes: Uint8Array) => boolean;
}> = [
  { mime: "image/png", prefix: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", prefix: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", prefix: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", prefix: [0x52, 0x49, 0x46, 0x46], match: isWebp },
  { mime: "image/bmp", prefix: [0x42, 0x4d] },
  { mime: "image/x-icon", prefix: [0x00, 0x00, 0x01, 0x00] },
  { mime: "image/avif", prefix: [], match: isAvif },
  { mime: "image/heic", prefix: [], match: isHeic },
  { mime: "application/pdf", prefix: [0x25, 0x50, 0x44, 0x46] },
  { mime: "application/zip", prefix: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "video/mp4", prefix: [], match: isMp4 },
  { mime: "video/webm", prefix: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: "audio/mpeg", prefix: [0xff, 0xfb] },
  { mime: "audio/mpeg", prefix: [0x49, 0x44, 0x33] },
  { mime: "audio/wav", prefix: [0x52, 0x49, 0x46, 0x46], match: isWav },
  { mime: "audio/ogg", prefix: [0x4f, 0x67, 0x67, 0x53] },
  { mime: "audio/flac", prefix: [0x66, 0x4c, 0x61, 0x43] },
];

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  );
}

function isWav(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x41, 0x56, 0x45], 8)
  );
}

function isMp4(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4);
}

function isAvif(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (!startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return brand === "avif" || brand === "avis";
}

function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (!startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return brand === "heic" || brand === "heix" || brand === "heim" || brand === "heis";
}

/**
 * Sniff a MIME from the leading bytes. Returns `null` if no rule matches —
 * the caller decides whether to fall back to extension or octet-stream.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  for (const rule of MAGIC_TABLE) {
    if (rule.match) {
      if (rule.match(bytes)) return rule.mime;
      continue;
    }
    if (startsWith(bytes, rule.prefix, rule.offset)) return rule.mime;
  }
  return null;
}

/**
 * Read the first N bytes of a Blob/File without loading the whole thing.
 * Sniff window is 32 bytes — enough for every rule above.
 */
export async function sniffMimeFromBlob(blob: Blob): Promise<string | null> {
  const slice = blob.slice(0, 32);
  const buffer = await slice.arrayBuffer();
  return sniffMime(new Uint8Array(buffer));
}
