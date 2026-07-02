/**
 * features/files/utils/checksum.ts
 *
 * Client-side SHA-256 hashing for upload files. Mirrors the algorithm
 * the Python backend uses to compute `cld_files.checksum` so the two
 * values are directly comparable — meaning we can detect "user is
 * uploading bytes we already have" before issuing the upload.
 *
 * Implementation details:
 *   - Uses the browser's native `crypto.subtle.digest("SHA-256", …)`
 *     which is hardware-accelerated on every modern browser. Hashing
 *     a 100 MB file is ~60–200 ms on a typical laptop — fast enough
 *     to do synchronously before showing the duplicate dialog.
 *   - Hashes are cached on the File object via a WeakMap so dropping
 *     the same File twice (e.g. user drops then changes their mind
 *     about the dialog and tries again) doesn't re-hash.
 *
 * Intentionally NOT streaming — we read the whole ArrayBuffer up
 * front. For files >500 MB consider streaming with `crypto.subtle`
 * + a chunked Web Worker; not in scope until users actually hit it.
 */

// WeakMap — keyed on the File reference, so the entry is garbage-
// collected automatically when the File goes out of scope.
const cache = new WeakMap<File, string>();

/**
 * Compute the lowercase hex SHA-256 of a File. Cached per-File. Falls
 * back to `null` when the platform doesn't support `crypto.subtle`
 * (very old browsers, http: contexts) — callers should treat `null`
 * as "couldn't dedupe; proceed with the upload as-is."
 */
export async function computeSHA256(file: File): Promise<string | null> {
  const cached = cache.get(file);
  if (cached) return cached;

  if (
    typeof crypto === "undefined" ||
    !crypto.subtle ||
    typeof crypto.subtle.digest !== "function"
  ) {
    return null;
  }

  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const hex = bufferToHex(digest);
    cache.set(file, hex);
    return hex;
  } catch {
    return null;
  }
}

/**
 * Compute SHA-256 for several files in parallel with bounded
 * concurrency. Returns one entry per input File, in the same order;
 * `null` for files that couldn't be hashed.
 *
 * Why bounded: hashing pulls each file's bytes into memory. Doing
 * 100 files at once across a 4 GB drop would OOM the tab. 4 in
 * flight at a time keeps memory pressure predictable.
 */
export async function computeSHA256Batch(
  files: File[],
  concurrency = 4,
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(files.length).fill(null);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= files.length) return;
      results[i] = await computeSHA256(files[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, () => worker()),
  );
  return results;
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}
