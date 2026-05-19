/**
 * features/image-studio/api/python.ts
 *
 * Typed REST client for the Python image-ops endpoints (see
 * /Users/armanisadeghi/code/aidream/docs/IMAGE_OPS.md for the full surface).
 *
 * All ops take a `source_id` (cld_files UUID) + optional `mask_id` and
 * produce a new `cld_files` row carrying derivation metadata; the source
 * is never mutated. Every edit is non-destructive — the FE can walk
 * `metadata.derived_from` to reconstruct history.
 *
 * The platform exposes ~40 ops behind a single op-discriminated endpoint
 * (`POST /images/edit`) plus convenience wrappers for the optional-backend
 * ops (`bg_remove`, `inpaint`). This client mirrors that shape: a generic
 * `applyEdit` + typed sugar for the common families.
 */

import { postJson } from "@/lib/python-client";

// ---------------------------------------------------------------------------
// Output options — shared across every op
// ---------------------------------------------------------------------------

export interface EditOutput {
  /** "private" | "public" | "shared". Defaults to "private". */
  visibility?: "private" | "public" | "shared";
  /** Logical folder for the result. Defaults to `<source-folder>/edits`. */
  folder?: string;
  /** Output format. Defaults to "png". */
  format?: "png" | "jpeg" | "webp" | "avif";
  /** 1..100. Default 90. */
  quality?: number;
  /**
   * Optional Asset preset (e.g. "web", "social") — also renders preset
   * variants on the result without a second round-trip.
   */
  preset?: string;
  /** Filename override. */
  filename?: string;
}

// ---------------------------------------------------------------------------
// Asset envelope (matches features/files/types.ts Asset)
// ---------------------------------------------------------------------------

export interface AssetVariantUrl {
  url: string | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
}

export interface AssetEnvelope {
  file_id: string;
  primary_url: string | null;
  /** Variant key → URL set. */
  variants: Record<string, AssetVariantUrl>;
  metadata?: Record<string, unknown>;
}

// Legacy result shape returned by bg-remove convenience endpoint.
export interface ImageResult {
  cloud_file_id: string;
  public_url: string;
  mime: string;
  width: number;
  height: number;
}

export interface EditResponse {
  /** Standard Asset envelope. */
  asset: AssetEnvelope;
}

// ---------------------------------------------------------------------------
// Prompt-based AI edit — stub for the natural-language image edit feature
// that ships behind /images/edit-by-prompt (Wave 2 per IMAGE_OPS.md). The
// frontend keeps a UI affordance ready so the feature lights up the moment
// the endpoint lands; until then the call surfaces a friendly "ships next
// wave" toast.
// ---------------------------------------------------------------------------

export interface EditByPromptBody {
  source_id: string;
  prompt: string;
  /** Optional mask cloud_file_id — constrains the edit to the masked region. */
  mask_id?: string;
  output?: EditOutput;
}

export async function editImageByPrompt(
  body: EditByPromptBody,
): Promise<EditResponse> {
  const { data } = await postJson<EditResponse, EditByPromptBody>(
    "/images/edit-by-prompt",
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Suggest edits — stub for the `image-suggest-edits` agent shortcut. The
// agent inspects the image and proposes a sequence of ops to apply. Wire
// goes live the moment the shortcut lands in `system-shortcuts.ts`.
// ---------------------------------------------------------------------------

export interface SuggestEditsBody {
  source_id: string;
  /** Optional steering hint, e.g. "lighter and warmer", "make it pop". */
  hint?: string;
}

export interface SuggestEditsResponse {
  /** Ordered list of ops the agent would apply. */
  suggestions: Array<{
    op: string;
    params: Record<string, unknown>;
    label: string;
    rationale?: string;
  }>;
}

export async function suggestEdits(
  body: SuggestEditsBody,
): Promise<SuggestEditsResponse> {
  const { data } = await postJson<SuggestEditsResponse, SuggestEditsBody>(
    "/images/suggest-edits",
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Generic op dispatcher — matches POST /images/edit exactly
// ---------------------------------------------------------------------------

export interface EditBody<P = Record<string, unknown>> {
  source_id: string;
  /** Optional mask cloud_file_id (PNG RGBA, alpha = mask). */
  mask_id?: string | null;
  /** Op id — see GET /images/ops. */
  op: string;
  /** Op-specific params. */
  params?: P;
  output?: EditOutput;
}

export async function applyEdit<P = Record<string, unknown>>(
  body: EditBody<P>,
): Promise<EditResponse> {
  const { data } = await postJson<EditResponse, EditBody<P>>(
    "/images/edit",
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Typed sugar for the most commonly used ops
// ---------------------------------------------------------------------------

export interface AdjustParams {
  /** Multipliers (1.0 = no change). */
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
  /** Degrees (-180..180). */
  hue_rotate?: number;
  gamma?: number;
  /** Stops (-3..3). */
  exposure?: number;
  /** Kelvin shift (-100..100). */
  temperature?: number;
  /** -100..100. Magenta/green. */
  tint?: number;
  /** 0..2. Smart saturation. */
  vibrance?: number;
}
export const adjust = (
  source_id: string,
  params: AdjustParams,
  output?: EditOutput,
) => applyEdit<AdjustParams>({ source_id, op: "adjust", params, output });

export const autoColor = (source_id: string, output?: EditOutput) =>
  applyEdit({ source_id, op: "auto_color", output });

export const autoLevels = (
  source_id: string,
  params: { cutoff?: number } = {},
  output?: EditOutput,
) => applyEdit({ source_id, op: "auto_levels", params, output });

export const grayscale = (source_id: string, output?: EditOutput) =>
  applyEdit({ source_id, op: "grayscale", output });

export const sharpen = (
  source_id: string,
  params: { amount?: number; radius?: number; threshold?: number } = {},
  output?: EditOutput,
) => applyEdit({ source_id, op: "sharpen", params, output });

export const denoise = (
  source_id: string,
  params: { strength?: 1 | 2 | 3 } = {},
  output?: EditOutput,
) => applyEdit({ source_id, op: "denoise", params, output });

// ---------------------------------------------------------------------------
// Background removal — convenience wrapper at /images/bg-remove
// ---------------------------------------------------------------------------

export interface BgRemoveBody {
  source_id: string;
  /** When supplied, OR'd into the alpha output — "definitely foreground". */
  mask_id?: string;
  /** Force a specific rembg model — default "u2net". */
  model?: "u2net" | "u2netp" | "isnet-general-use" | "birefnet-general";
  /** Cleaner alpha mattes (slower). Default false. */
  alpha_matting?: boolean;
  output?: EditOutput;
}

export async function removeBackground(
  body: BgRemoveBody,
): Promise<EditResponse> {
  const { data } = await postJson<EditResponse, BgRemoveBody>(
    "/images/bg-remove",
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Inpaint — convenience wrapper at /images/inpaint. Mask REQUIRED.
// ---------------------------------------------------------------------------

export interface InpaintBody {
  source_id: string;
  mask_id: string;
  /** Telea (default, fast) or NS (Navier-Stokes, slightly higher quality). */
  method?: "telea" | "ns";
  /** Inpaint radius in pixels. Default 3. */
  radius?: number;
  output?: EditOutput;
}

export async function inpaint(body: InpaintBody): Promise<EditResponse> {
  const { data } = await postJson<EditResponse, InpaintBody>(
    "/images/inpaint",
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Upscale — kept for backward compat; routes through the generic /images/edit
// with op=resize (proper "super-resolution" lands in Wave 2). For now, this
// is a 2× / 4× cubic resize.
// ---------------------------------------------------------------------------

export async function upscaleImage(body: {
  source_id: string;
  factor: 2 | 4;
}): Promise<EditResponse> {
  // The platform exposes upscale through the legacy /images/upscale endpoint
  // that aidream provides for backward compat — fall through to it.
  const { data } = await postJson<EditResponse, { source_id: string; factor: 2 | 4 }>(
    "/images/upscale",
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Catalog query — GET /images/ops returns each op's JSON Schema, plus
// backend availability info. Useful for driving a "more edits" picker.
// ---------------------------------------------------------------------------

export interface OpsCatalogEntry {
  op: string;
  family: string;
  available: boolean;
  /** Hints for the picker: human label + brief blurb. */
  label?: string;
  description?: string;
  /** JSON Schema for `params`. */
  params_schema?: Record<string, unknown>;
}

export async function listOps(): Promise<OpsCatalogEntry[]> {
  const { data } = await postJson<OpsCatalogEntry[], Record<string, never>>(
    "/images/ops",
    {},
  );
  return data;
}

// ---------------------------------------------------------------------------
// Generate (text → image) — preserved for the existing generate route +
// the ImageAssetUploader's "Generate" tab. Not part of the IMAGE_OPS edit
// surface but lives at the same `/images/*` namespace.
// ---------------------------------------------------------------------------

export interface GenerateImageBody {
  prompt: string;
  size?: "square" | "portrait" | "landscape" | "wide" | "tall";
  style?: string;
  count?: number;
  model?: string;
}

export interface GenerateImageResponse {
  files: ImageResult[];
}

export async function generateImage(
  body: GenerateImageBody,
): Promise<GenerateImageResponse> {
  const { data } = await postJson<GenerateImageResponse, GenerateImageBody>(
    "/images/generate",
    body,
  );
  return data;
}

// ---------------------------------------------------------------------------
// Face detection — preserved for Annotate / Avatar modes that anchor on
// faces.
// ---------------------------------------------------------------------------

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetectBody {
  source_id: string;
}

export interface FaceDetectResponse {
  faces: Array<BBox & { confidence: number }>;
}

export async function detectFaces(
  body: FaceDetectBody,
): Promise<FaceDetectResponse> {
  const { data } = await postJson<FaceDetectResponse, FaceDetectBody>(
    "/images/face-detect",
    body,
  );
  return data;
}
