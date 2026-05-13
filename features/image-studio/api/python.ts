/**
 * features/image-studio/api/python.ts
 *
 * Typed REST client for the Python image-ops endpoints.
 *
 * These endpoints take/produce cloud_file_ids — no raw bytes. The browser
 * uploads the source via the universal handler (`fileHandler.upload(...)`
 * / `useFileUpload`), gets a cloud_file_id back, sends it here, gets a
 * new cloud_file_id back, then renders the result via the standard
 * cloud-files render path.
 *
 * The auth/header pattern is identical to features/files/api/client.ts
 * (Supabase JWT, X-Request-Id). When the Python team implements the routes,
 * NOTHING on the front end needs to change — the contract is what's below.
 *
 * Until the Python endpoints land, these calls return a typed 404 that the
 * UI surfaces as "Not yet available — coming soon" rather than a generic
 * error.
 */

import { postJson } from "@/lib/python-client";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * Every endpoint that produces an image returns a `cloud_file_id` (and the
 * canonical public URL the front end can render immediately without a
 * follow-up fetch). This matches the cloud-files contract.
 */
export interface ImageResult {
  cloud_file_id: string;
  public_url: string;
  mime: string;
  width: number;
  height: number;
}

export interface BBox {
  /** All values are normalized 0–1 of source dimensions. */
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Generate — text → image
// ---------------------------------------------------------------------------

export interface GenerateImageBody {
  prompt: string;
  size?: "square" | "portrait" | "landscape" | "wide" | "tall";
  /** Optional style hint. e.g. "photorealistic", "editorial illustration". */
  style?: string;
  /** Number of images to generate. Backend caps to a reasonable max. */
  count?: number;
  /** Optional model override; backend picks a sensible default. */
  model?: string;
}

export interface GenerateImageResponse {
  files: ImageResult[];
}

export async function generateImage(
  body: GenerateImageBody,
): Promise<GenerateImageResponse> {
  const { data } = await postJson<GenerateImageResponse, GenerateImageBody>(
    `/images/generate`,
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Edit — image + natural-language instruction → image
// ---------------------------------------------------------------------------

export interface EditImageBody {
  source_id: string;
  prompt: string;
  /** Optional mask cloud_file_id (PNG with alpha). When present, behaves as inpaint. */
  mask_id?: string;
}

export interface EditImageResponse {
  file: ImageResult;
}

export async function editImage(body: EditImageBody): Promise<EditImageResponse> {
  const { data } = await postJson<EditImageResponse, EditImageBody>(
    `/images/edit`,
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Inpaint — image + mask + prompt → image
// ---------------------------------------------------------------------------

export interface InpaintImageBody {
  source_id: string;
  mask_id: string;
  prompt: string;
}

export async function inpaintImage(
  body: InpaintImageBody,
): Promise<EditImageResponse> {
  const { data } = await postJson<EditImageResponse, InpaintImageBody>(
    `/images/inpaint`,
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Background removal
// ---------------------------------------------------------------------------

export interface BgRemoveBody {
  source_id: string;
  /** Optional sensitivity for edge refinement. */
  refine_edges?: boolean;
}

export async function removeBackground(
  body: BgRemoveBody,
): Promise<EditImageResponse> {
  const { data } = await postJson<EditImageResponse, BgRemoveBody>(
    `/images/bg-remove`,
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Upscale
// ---------------------------------------------------------------------------

export interface UpscaleBody {
  source_id: string;
  factor: 2 | 4;
}

export async function upscaleImage(
  body: UpscaleBody,
): Promise<EditImageResponse> {
  const { data } = await postJson<EditImageResponse, UpscaleBody>(
    `/images/upscale`,
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export interface VariantsBody {
  source_id: string;
  count: number;
  /** 0 = identical, 1 = wildly different. Default 0.5. */
  strength?: number;
}

export interface VariantsResponse {
  files: ImageResult[];
}

export async function generateVariants(
  body: VariantsBody,
): Promise<VariantsResponse> {
  const { data } = await postJson<VariantsResponse, VariantsBody>(
    `/images/variants`,
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Face detection (used by Smart Crop, Blur Faces)
// ---------------------------------------------------------------------------

export interface FaceDetectBody {
  source_id: string;
}

export interface FaceDetectResponse {
  /** All bboxes are normalized 0–1. */
  faces: Array<BBox & { confidence: number }>;
}

export async function detectFaces(
  body: FaceDetectBody,
): Promise<FaceDetectResponse> {
  const { data } = await postJson<FaceDetectResponse, FaceDetectBody>(
    `/images/face-detect`,
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Style transfer (later)
// ---------------------------------------------------------------------------

export interface StyleTransferBody {
  source_id: string;
  /** e.g. "watercolor", "pencil", "oil-painting", "comic". */
  style: string;
}

export async function styleTransfer(
  body: StyleTransferBody,
): Promise<EditImageResponse> {
  const { data } = await postJson<EditImageResponse, StyleTransferBody>(
    `/images/style-transfer`,
    body,
  );
  return data;
}
