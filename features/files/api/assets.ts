/**
 * features/files/api/assets.ts
 *
 * Typed REST wrapper for the unified asset (image / media) pipeline.
 *
 *   POST   /assets                          multipart upload + render
 *   GET    /assets/{file_id}                read Asset envelope
 *   PATCH  /assets/{file_id}                visibility / share / metadata
 *   POST   /assets/{file_id}/variants       render more variants
 *   GET    /assets/presets                  list every server-known preset
 *   GET    /files/{file_id}/asset           any cld_files row → Asset envelope
 *
 * Every endpoint returns the same {@link Asset} envelope (see
 * `features/files/types.ts`). `GET /files/{id}/asset` is the canonical
 * "click-to-render" primitive — pass any file_id, get back inline-renderable
 * URLs grouped by variant key.
 *
 * Auth + request-id + idempotency-key + bypass-secret plumbing all flow
 * through the same client helpers used by `files.ts`; see
 * [./client.ts](./client.ts) for the contract.
 */

import {
  getJson,
  patchJson,
  postJson,
  postMultipart,
  uploadWithProgress,
  type RequestOptions,
  type ResponseMeta,
  type UploadProgressEvent,
} from "@/lib/python-client";
import type {
  AddAssetVariantsRequest,
  Asset,
  AssetPatchRequest,
  AssetPreset,
  PresetsRegistryResponse,
  Visibility,
} from "@/features/files/types";
import { ENDPOINTS } from "@/lib/api/endpoints";

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Spec for a one-off custom variant — sent verbatim to the server in
 * `custom_variants_json`. Use this for ad-hoc dimensions that don't fit
 * any built-in preset. Prefer the preset registry when possible so the
 * resulting variant has a well-known key downstream renderers recognise.
 */
export interface CustomVariantSpec {
  key: string;
  suffix?: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: string;
}

export interface UploadAssetParams {
  file: File;
  /** Preset name. Default: `"raw"` — no derived variants. */
  preset?: AssetPreset;
  /** Logical folder path. Server defaults to `Assets/<uuid>` when omitted. */
  folder?: string;
  /** Default `"public"`. */
  visibility?: Visibility;
  /** Comma-separated user IDs OR an explicit list (the wrapper joins). */
  shareWith?: string | ReadonlyArray<string>;
  /** Default `"read"`. */
  shareLevel?: "read" | "write" | "admin";
  /** Signed-URL TTL in seconds. Server bounds to [60, 604800]. Default 3600. */
  signedUrlTtl?: number;
  /** Override the preset's default `include_social_baseline`. */
  includeSocialBaseline?: boolean;
  /** Free-form metadata to attach to every variant + the master row. */
  metadata?: Record<string, unknown>;
  /** Ad-hoc variant specs in addition to (or instead of) the preset. */
  customVariants?: ReadonlyArray<CustomVariantSpec>;
}

function buildUploadForm(params: UploadAssetParams): FormData {
  const form = new FormData();
  form.append("file", params.file);
  if (params.preset) form.append("preset", params.preset);
  if (params.folder) form.append("folder", params.folder);
  if (params.visibility) form.append("visibility", params.visibility);
  if (params.shareWith !== undefined) {
    const joined = Array.isArray(params.shareWith)
      ? params.shareWith.join(",")
      : (params.shareWith as string);
    if (joined) form.append("share_with", joined);
  }
  if (params.shareLevel) form.append("share_level", params.shareLevel);
  if (params.signedUrlTtl !== undefined)
    form.append("signed_url_ttl", String(params.signedUrlTtl));
  if (params.includeSocialBaseline !== undefined)
    form.append(
      "include_social_baseline",
      params.includeSocialBaseline ? "true" : "false",
    );
  if (params.metadata)
    form.append("metadata_json", JSON.stringify(params.metadata));
  if (params.customVariants && params.customVariants.length)
    form.append("custom_variants_json", JSON.stringify(params.customVariants));
  return form;
}

/**
 * Upload an asset and render preset variants in one round-trip.
 * Returns the canonical {@link Asset} envelope — the same shape every
 * other endpoint in this module returns.
 */
export async function uploadAsset(
  params: UploadAssetParams,
  opts: RequestOptions = {},
): Promise<{ data: Asset; meta: ResponseMeta }> {
  const form = buildUploadForm(params);
  return postMultipart<Asset>(ENDPOINTS.assets.upload, form, opts);
}

/**
 * Same as `uploadAsset` but with progress callbacks. Useful for big
 * uploads where the user expects a `Uploading 12 / 30 MB…` indicator.
 */
export async function uploadAssetWithProgress(
  params: UploadAssetParams,
  onProgress: (event: UploadProgressEvent) => void,
  opts: RequestOptions = {},
): Promise<{ data: Asset; meta: ResponseMeta }> {
  const form = buildUploadForm(params);
  return uploadWithProgress<Asset>(
    ENDPOINTS.assets.upload,
    form,
    onProgress,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export interface GetAssetParams {
  /** Signed-URL TTL in seconds. Server bounds to [60, 604800]. */
  signed_url_ttl?: number;
}

/**
 * Read the Asset envelope for a known asset master file id.
 *
 * Use this when you already uploaded through `/assets` and want to
 * re-read the envelope (e.g. after a visibility change). For a generic
 * "give me an Asset for this file_id" call (where the file may or may
 * not have been uploaded through the asset pipeline), prefer
 * {@link getAssetForFile}.
 */
export async function getAsset(
  fileId: string,
  params: GetAssetParams = {},
  opts: RequestOptions = {},
): Promise<{ data: Asset; meta: ResponseMeta }> {
  const q =
    params.signed_url_ttl !== undefined
      ? `?signed_url_ttl=${params.signed_url_ttl}`
      : "";
  return getJson<Asset>(`${ENDPOINTS.assets.detail(fileId)}${q}`, opts);
}

/**
 * Canonical click-to-render primitive: hand any cld_files row id, get
 * back an Asset envelope (with at least an `original` variant). Works
 * regardless of whether the file was uploaded through the asset
 * pipeline. The hook around this is {@link useFileAsset}.
 */
export async function getAssetForFile(
  fileId: string,
  params: GetAssetParams = {},
  opts: RequestOptions = {},
): Promise<{ data: Asset; meta: ResponseMeta }> {
  const q =
    params.signed_url_ttl !== undefined
      ? `?signed_url_ttl=${params.signed_url_ttl}`
      : "";
  return getJson<Asset>(`${ENDPOINTS.assets.forFile(fileId)}${q}`, opts);
}

// ---------------------------------------------------------------------------
// Mutate
// ---------------------------------------------------------------------------

/**
 * PATCH `/assets/{file_id}` — change visibility / share / metadata.
 * Returns the new Asset envelope reflecting the change (URLs included).
 */
export async function patchAsset(
  fileId: string,
  body: AssetPatchRequest,
  opts: RequestOptions = {},
): Promise<{ data: Asset; meta: ResponseMeta }> {
  // The backend accepts `share_with` as either a comma-separated string
  // or a list; normalise to the string form so callers can pass either.
  const normalised: AssetPatchRequest = {
    ...body,
    share_with: Array.isArray(body.share_with)
      ? body.share_with.join(",")
      : body.share_with,
  };
  return patchJson<Asset, AssetPatchRequest>(
    ENDPOINTS.assets.patch(fileId),
    normalised,
    opts,
  );
}

/**
 * POST `/assets/{file_id}/variants` — render more variants for an
 * existing asset. Idempotent on `(file_id, variant_key)`: re-rendering
 * a key that already exists is a no-op (the server returns the
 * existing variant).
 */
export async function addAssetVariants(
  fileId: string,
  body: AddAssetVariantsRequest,
  opts: RequestOptions = {},
): Promise<{ data: Asset; meta: ResponseMeta }> {
  return postJson<Asset, AddAssetVariantsRequest>(
    ENDPOINTS.assets.addVariants(fileId),
    body,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Presets registry
// ---------------------------------------------------------------------------

/**
 * List every server-known preset and its variants. Use this to drive
 * picker UIs / admin tooling instead of hardcoding the list in TS.
 */
export async function getAssetPresets(
  opts: RequestOptions = {},
): Promise<{ data: PresetsRegistryResponse; meta: ResponseMeta }> {
  return getJson<PresetsRegistryResponse>(ENDPOINTS.assets.presets, opts);
}

// ---------------------------------------------------------------------------
// No-persist preview + PDF compress (E.16 + E.17, matrx-utils v1.1.0)
// ---------------------------------------------------------------------------

/**
 * Spec for a single preview variant — width/height drives the resize;
 * `format` and `quality` control the output encoding. Sent verbatim to
 * the server (no client-side image processing).
 */
export interface PreviewVariantSpec {
  key: string;
  width?: number;
  height?: number;
  format?: "jpeg" | "png" | "webp" | "avif";
  quality?: number;
  fit?: "cover" | "contain" | "fill";
}

export interface PreviewVariantResult {
  key: string;
  width: number | null;
  height: number | null;
  mime_type: string;
  file_size: number;
  /** base64 data URL for small variants (≤256 KB). */
  data_url: string | null;
  /** 5-min ephemeral signed URL for larger variants. */
  signed_url: string | null;
}

export interface AssetPreviewResult {
  variants: PreviewVariantResult[];
}

export interface PdfCompressResult {
  original_size: number;
  compressed_size: number;
  /** 0..1 — fraction of bytes saved. */
  reduction_ratio: number;
  mime_type: string;
  data_url: string | null;
  signed_url: string | null;
}

/**
 * `POST /assets/preview/multipart` — render preview variants WITHOUT
 * persisting the master. Image Studio uses this for the drag-and-drop
 * preview flow; the user can then commit-to-save via `POST /assets`.
 *
 * Each variant comes back as either an inline `data_url` (small) or an
 * ephemeral `signed_url` (5-minute TTL).
 */
export async function previewAssetMultipart(
  file: File | Blob,
  variants: PreviewVariantSpec[],
  options: { maxInlineBytes?: number } = {},
  opts: RequestOptions = {},
): Promise<{ data: AssetPreviewResult; meta: ResponseMeta }> {
  const form = new FormData();
  form.append("file", file);
  form.append("variants", JSON.stringify(variants));
  if (typeof options.maxInlineBytes === "number") {
    form.append("max_inline_bytes", String(options.maxInlineBytes));
  }
  return postMultipart<AssetPreviewResult>(
    ENDPOINTS.assets.previewMultipart,
    form,
    opts,
  );
}

/**
 * `POST /assets/pdf-compress/multipart` — compress a PDF WITHOUT
 * persisting it. Returns `data_url` (≤256 KB) or `signed_url`
 * (5-minute TTL). Replaces the deleted Next.js Sharp/PDF route.
 *
 * @param level minimum compression tier (1..5). Default 3. Server may
 *   escalate above this when `maxSizeBytes` forces it.
 * @param maxSizeBytes optional absolute upper bound on output size.
 */
export async function compressPdfMultipart(
  file: File | Blob,
  options: { level?: number; maxSizeBytes?: number; maxInlineBytes?: number } = {},
  opts: RequestOptions = {},
): Promise<{ data: PdfCompressResult; meta: ResponseMeta }> {
  const form = new FormData();
  form.append("file", file);
  form.append("level", String(options.level ?? 3));
  if (typeof options.maxSizeBytes === "number") {
    form.append("max_size_bytes", String(options.maxSizeBytes));
  }
  if (typeof options.maxInlineBytes === "number") {
    form.append("max_inline_bytes", String(options.maxInlineBytes));
  }
  return postMultipart<PdfCompressResult>(
    ENDPOINTS.assets.pdfCompressMultipart,
    form,
    opts,
  );
}

/**
 * Materialize a `PreviewVariantResult` / `PdfCompressResult` body that
 * carries either `data_url` or `signed_url` into a `Blob`. Useful when
 * the FE needs the bytes locally (e.g. to wrap in a `File` for further
 * upload).
 */
export async function materializeAssetResult(
  result: { data_url: string | null; signed_url: string | null; mime_type: string },
): Promise<Blob> {
  if (result.data_url) {
    const response = await fetch(result.data_url);
    return response.blob();
  }
  if (result.signed_url) {
    const response = await fetch(result.signed_url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ephemeral asset URL: HTTP ${response.status}`);
    }
    return response.blob();
  }
  throw new Error("Asset result has neither data_url nor signed_url");
}
