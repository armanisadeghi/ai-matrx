/**
 * Image Studio types
 * Shared type surface for the client studio, the process API, and the
 * save API. Everything that crosses the network is declared here so the
 * client and server agree on the shape.
 */

import type { OutputFormat, StudioPreset } from "./presets";

export type { OutputFormat, StudioPreset };

/**
 * Fit mode — controls what happens when the preset's aspect ratio doesn't
 * match the source.
 *
 *   - cover   Fill the whole target; crop overflow. (Default.)
 *   - contain Letterbox the full image inside the target; pad with bg.
 *   - inside  Shrink to fit inside the target, keep aspect ratio.
 *             No crop, no upscale, no padding — output may be smaller.
 */
export type ImageFit = "cover" | "contain" | "inside";

/**
 * Focal point anchor. The 9 compass values are standard crops;
 * `entropy` and `attention` use Sharp's smart-crop algorithms to pick the
 * most interesting region automatically.
 */
export type ImagePositionAnchor =
    | "center"
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "entropy"
    | "attention";

/**
 * Continuous focal point. `x` and `y` are normalized to [0, 1] — the
 * percentage across the source image where the centre of the crop should
 * sit. The studio drag-to-adjust UI emits these and the server crops via
 * `sharp.extract(...)` + `.resize(...)`.
 */
export interface ImagePositionPoint {
    x: number;
    y: number;
}

/**
 * Either a named anchor (the 9 compass + 2 smart) or a precise focal point.
 * The latter wins when both could apply; consumers should `typeof === "string"`
 * to discriminate.
 */
export type ImagePosition = ImagePositionAnchor | ImagePositionPoint;

// ── Client-side file state ────────────────────────────────────────────────

export type StudioFileStatus =
    | "idle"
    | "reading"
    | "processing"
    | "processed"
    | "error";

/**
 * Structured output from the Describe-with-AI agent (shortcut
 * `ed0a90f8-b406-4af8-8f47-c41c0c4ff086`). Mirrors the JSON the agent
 * returns wrapped in a code block — every field is independently editable
 * by the user before save.
 */
export interface ImageMetadata {
    /** SEO-friendly slug; folded into `filenameBase` on accept. */
    filename_base: string;
    /** WCAG-compliant accessibility description. */
    alt_text: string;
    /** Short caption suitable for social posts. */
    caption: string;
    /** Page / OG title. */
    title: string;
    /** Meta description (≈155 chars). */
    description: string;
    /** Free-form SEO keyword list. */
    keywords: string[];
    /** Hex codes for theming or palette pickers. */
    dominant_colors: string[];
}

export type StudioMetadataStatus =
    | "idle"
    | "uploading-source"
    | "describing"
    | "ready"
    | "error";

export interface StudioSourceFile {
    /** Client-side id, not tied to storage. */
    id: string;
    /** Original file name (used as default filename base). */
    originalName: string;
    /** MIME type the browser reported. */
    mimeType: string;
    /** Original byte size. */
    size: number;
    /** Original image dimensions (once decoded). */
    width: number | null;
    height: number | null;
    /** Object URL for showing the original in the UI. Revoke on unmount. */
    objectUrl: string;
    /** Base (slug) used in generated filenames. */
    filenameBase: string;
    /** Lifecycle state for progress UI. */
    status: StudioFileStatus;
    /** Human-readable error if status === "error". */
    error?: string | null;
    /** The produced variants, keyed by preset id. */
    variants: Record<string, ProcessedVariant>;
    /** Raw File for re-processing. */
    file: File;
    /** Agent-authored metadata (filename, alt-text, caption, etc.). */
    imageMetadata?: ImageMetadata | null;
    /** Lifecycle for the AI describe call. */
    metadataStatus: StudioMetadataStatus;
    /** Human-readable error from the describe call. */
    metadataError?: string | null;
    /**
     * Cloud-files id of the temporary preview uploaded for the describe
     * agent. Cached so re-describe doesn't re-upload.
     */
    describePreviewFileId?: string | null;
}

export interface ProcessedVariant {
    /** The preset this variant was generated from. */
    presetId: string;
    /** Filename with extension. */
    filename: string;
    /** Final dimensions written by Sharp. */
    width: number;
    height: number;
    /** Output format applied. */
    format: OutputFormat;
    /** Quality (1–100) applied — null for PNG. */
    quality: number | null;
    /** Output byte size. */
    size: number;
    /** Base64 data URL for in-browser preview + single-file download. */
    dataUrl: string;
    /** Compression ratio: (1 - size/originalSize) * 100. Cached once. */
    compressionRatio: number | null;
    /** Fit mode actually applied. */
    fit: ImageFit;
    /** Position actually applied (cover only). */
    position: ImagePosition | null;
    /** Cloud-files file id once the variant has been saved to the library. */
    fileId?: string | null;
    /**
     * Permanent public CDN URL (Cloudflare-fronted, with a `?v=<checksum>`
     * cache-buster) when the file is uploaded with `visibility: "public"`
     * and the API returned a CDN URL. ``null`` otherwise — for private
     * variants, callers should call `getSignedUrl(fileId)` for a 1h
     * AWS-signed URL.
     *
     * **Never** copy the data URL once the variant is saved; that's the
     * massive base64 string we ship for in-browser preview only.
     */
    publicUrl?: string | null;
    /** Saved-to-library state — controlled by the save step. */
    savedAt?: string | null;
}

export interface SaveStudioResult {
    /** Logical folder path the variants landed in (e.g. "Images/Generated/image-studio/my-set"). */
    folderPath: string;
    /** Cloud-files parent folder id. */
    parentFolderId: string;
    /** Number of variants that uploaded successfully. */
    savedCount: number;
    /** Filenames that failed to upload (if any). */
    failedFilenames: string[];
}

// ── Save pipeline (cloud-files) ───────────────────────────────────────────
// Saving is no longer a bespoke POST — variants are uploaded via the
// `uploadFiles` thunk from `@/features/files` after ensuring the target
// folder exists with `ensureFolderPath`. See `useImageStudio.saveAll`.
