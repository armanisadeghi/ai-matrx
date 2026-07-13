/**
 * Client-side download helpers for the Image Studio.
 *
 * A variant's in-memory URL (`ProcessedVariant.dataUrl`) is either an inline
 * `data:` URL (small variants) OR an ephemeral **signed S3 URL** (large
 * variants — the preview API returns a 5-minute `signed_url` when the bytes
 * exceed the inline cap). Both must download the SAME way: fetch into a Blob,
 * then save from a same-origin `blob:` URL.
 *
 * Why never `<a href={signedUrl} download>`: a cross-origin S3 URL makes the
 * browser IGNORE the `download` attribute and NAVIGATE the tab to S3 instead —
 * which both leaks the signed URL into the address bar (against our media
 * rules) and destroys the studio's in-memory state (back-button returns to a
 * blank studio). A `blob:` URL is same-origin, so `download` is honoured and
 * nothing navigates.
 */

import JSZip from "jszip";

export interface BundleEntry {
    /** Sub-folder inside the ZIP. Omit for root. */
    folder?: string;
    filename: string;
    /** `data:` URL, `blob:` URL, or an https(S3) URL — all are fetched to bytes. */
    dataUrl: string;
}

/** Fetch any URL form (`data:` / `blob:` / signed https) into raw bytes. */
async function urlToBytes(url: string): Promise<Uint8Array> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
}

export async function downloadVariantsAsZip(
    entries: BundleEntry[],
    zipFilename = "image-studio-export.zip",
): Promise<void> {
    if (entries.length === 0) return;

    const zip = new JSZip();

    // Fetch every entry's bytes (data:/blob:/signed URL) in parallel, then
    // add to the ZIP. A failed entry is skipped rather than aborting the
    // whole bundle — the caller surfaces the count via the returned promise.
    const resolved = await Promise.all(
        entries.map(async (entry) => {
            try {
                const bytes = await urlToBytes(entry.dataUrl);
                return { entry, bytes };
            } catch {
                return null;
            }
        }),
    );

    let added = 0;
    for (const item of resolved) {
        if (!item) continue;
        const { entry, bytes } = item;
        const path = entry.folder
            ? `${entry.folder}/${entry.filename}`
            : entry.filename;
        zip.file(path, bytes);
        added += 1;
    }
    if (added === 0) throw new Error("No variants could be downloaded");

    const blob = await zip.generateAsync({ type: "blob" });
    triggerBlobDownload(blob, zipFilename);
}

/**
 * Download a single variant. Fetches the URL (data:/blob:/signed S3) into a
 * Blob and saves it from a same-origin `blob:` URL — never navigates the tab.
 */
export async function downloadSingleVariant(
    dataUrl: string,
    filename: string,
): Promise<void> {
    const res = await fetch(dataUrl);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    triggerBlobDownload(await res.blob(), filename);
}

/** Save a Blob to disk via a transient same-origin `blob:` anchor. */
function triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
