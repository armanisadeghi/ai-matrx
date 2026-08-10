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

import { postJson, postNdjson } from "@/lib/python-client";
import { apiGet } from "@/lib/api/typed-client";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import type { components } from "@/types/python-generated/api-types";
import type {
  GeneratedImageFileItem,
  ImageEditCompleteData,
  ImageGenerateCompleteData,
} from "@/types/python-generated/stream-events";
import type { GenerateImageSize } from "../types";

// ---------------------------------------------------------------------------
// Output options — shared across every op
// ---------------------------------------------------------------------------

export interface EditOutput {
  /**
   * Canonical visibility vocabulary. Defaults to "personal". Never send the
   * retired spellings "shared"/"private" — the server rewrites either to
   * "personal", silently downgrading the asset.
   */
  visibility?: "personal" | "internal" | "link" | "public";
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

/**
 * Per IMAGE_OPS.md every op returns "the standard Asset envelope" — the
 * envelope IS the response body, not a wrapped `{ asset: … }`. Older
 * versions of this client wrapped it; consumers should destructure
 * `primary_url` / `variants` directly off the returned AssetEnvelope.
 */
export type EditResponse = AssetEnvelope;

/**
 * 2026-07 stream conversion: /images/edit, /images/bg-remove and
 * /images/inpaint now speak NDJSON. Pre-stream HTTP failures (400
 * unknown_op, 503 backend_unavailable, auth) still throw BackendApiError
 * from postNdjson; everything else arrives in-band. This helper drains the
 * stream and resolves with the terminal `image_edit_complete.asset` —
 * per the backend contract that field is the verbatim legacy Asset
 * envelope, byte-identical to the old blocking response body.
 */
async function drainEditStream<B extends object>(
  path: string,
  body: B,
): Promise<EditResponse> {
  const organizationId = await ensureOrgId(undefined);
  let asset: EditResponse | null = null;
  for await (const evt of postNdjson(path, {
    ...body,
    organization_id: organizationId,
  })) {
    if (evt.event === "error") {
      throw new Error(
        evt.data.user_message ?? evt.data.message ?? "Image edit failed.",
      );
    }
    if (evt.event !== "data") continue;
    const d = evt.data;
    if (!d || typeof d !== "object" || !("type" in d)) continue;
    // The generated data union includes UntypedDataPayload (indexed), so
    // literal narrowing alone can't pin the member — assert to the
    // generated per-event interface after checking the discriminant.
    if (d.type === "image_edit_complete") {
      const p = d as ImageEditCompleteData;
      // Server guarantee: `asset` is the unmodified legacy Asset envelope.
      asset = p.asset as unknown as EditResponse;
    }
  }
  if (!asset) {
    throw new Error(
      `The image-edit stream (${path}) ended without a result event.`,
    );
  }
  return asset;
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
  return drainEditStream("/images/edit", body);
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

// Per IMAGE_EDIT_API.md, the bg-remove/inpaint request models declare
// `extra="forbid"` and nest their knobs under `params`. Sending model /
// alpha_matting / method / radius at the top level → 422. Keep them nested.
export interface BgRemoveParams {
  /** Force a specific rembg model — default "u2net". */
  model?: "u2net" | "u2netp" | "isnet-general-use" | "birefnet-general";
  /** Cleaner alpha mattes (slower). Default false. */
  alpha_matting?: boolean;
  /** Flatten transparency onto this colour instead of leaving alpha. */
  background_color?: string;
}

export interface BgRemoveBody {
  source_id: string;
  /** When supplied, OR'd into the alpha output — "definitely foreground". */
  mask_id?: string;
  params?: BgRemoveParams;
  output?: EditOutput;
}

export async function removeBackground(
  body: BgRemoveBody,
): Promise<EditResponse> {
  return drainEditStream("/images/bg-remove", body);
}

// ---------------------------------------------------------------------------
// Inpaint — convenience wrapper at /images/inpaint. Mask REQUIRED.
// ---------------------------------------------------------------------------

export interface InpaintParams {
  /** Telea (default, fast) or NS (Navier-Stokes, slightly higher quality). */
  method?: "telea" | "ns";
  /** Inpaint radius in pixels. Default 3. */
  radius?: number;
}

export interface InpaintBody {
  source_id: string;
  mask_id: string;
  params?: InpaintParams;
  output?: EditOutput;
}

export async function inpaint(body: InpaintBody): Promise<EditResponse> {
  return drainEditStream("/images/inpaint", body);
}

// ---------------------------------------------------------------------------
// Upscale — there is NO /images/upscale endpoint (super-resolution is Wave 2
// per IMAGE_OPS.md). We route through the generic POST /images/edit with
// op="resize", which does a high-quality interpolated enlarge. Requires the
// source's natural dimensions so we can multiply by the factor.
// ---------------------------------------------------------------------------

export async function upscaleImage(body: {
  source_id: string;
  factor: 2 | 4;
  width: number;
  height: number;
}): Promise<EditResponse> {
  return applyEdit({
    source_id: body.source_id,
    op: "resize",
    params: {
      width: Math.round(body.width * body.factor),
      height: Math.round(body.height * body.factor),
      fit: "fill",
    },
  });
}

// ---------------------------------------------------------------------------
// Catalog query — GET /images/ops returns the op catalog + aspect ratios +
// backend availability. Drives a "more edits" picker and lets the UI hide
// ops whose optional backend isn't installed.
// ---------------------------------------------------------------------------

/** One op descriptor — DERIVED from the generated contract, never hand-mirrored. */
export type OpsCatalogEntry = components["schemas"]["ImageOpDescriptor"];

/**
 * `GET /images/ops` response — DERIVED from the generated OpenAPI contract.
 * A backend field rename lights up every reader here after `pnpm sync-types`.
 */
export type ImageOpsCatalog = components["schemas"]["ImageOpsCatalog"];

export async function listOps(): Promise<ImageOpsCatalog> {
  // GET, not POST — POSTing a GET-only route returns 405. Contract-bound: the
  // response type is derived from the `/images/ops` operation, not asserted.
  const { data } = await apiGet("/images/ops");
  return data;
}

// ---------------------------------------------------------------------------
// Generate (text → image) — POST /images/generate. Live since 2026-08-08:
// a thin aidream streaming wrapper over execute_ai_request with an
// image-modality catalog model (default gpt-image-2). Speaks NDJSON like
// the edit surface: `info` + one `media_block` per persisted asset, then a
// terminal `image_generate_complete` carrying the persisted files
// (cloud_file_id + always-renderable public_url). Each result is a real
// cld_files row with metadata.generation provenance.
// ---------------------------------------------------------------------------

export interface GenerateImageBody {
  prompt: string;
  /** Canonical vocabulary — see `GENERATE_IMAGE_SIZE_LABELS` in `../types`. */
  size?: GenerateImageSize;
  style?: string;
  count?: number;
  model?: string;
}

/** One generated file — DERIVED from the generated stream-event contract. */
export type GeneratedImageFile = GeneratedImageFileItem;

export interface GenerateImageResponse {
  files: GeneratedImageFile[];
}

/**
 * Drain the /images/generate NDJSON stream and resolve with the terminal
 * `image_generate_complete` payload (same drain pattern as drainEditStream).
 * Pre-stream HTTP failures (auth, 422) still throw BackendApiError from
 * postNdjson; provider errors arrive in-band as `error` events.
 */
export async function generateImage(
  body: GenerateImageBody,
): Promise<GenerateImageResponse> {
  const organizationId = await ensureOrgId(undefined);
  let complete: ImageGenerateCompleteData | null = null;
  for await (const evt of postNdjson("/images/generate", {
    ...body,
    organization_id: organizationId,
  })) {
    if (evt.event === "error") {
      throw new Error(
        evt.data.user_message ?? evt.data.message ?? "Image generation failed.",
      );
    }
    if (evt.event !== "data") continue;
    const d = evt.data;
    if (!d || typeof d !== "object" || !("type" in d)) continue;
    if (d.type === "image_generate_complete") {
      complete = d as ImageGenerateCompleteData;
    }
  }
  if (!complete) {
    throw new Error(
      "The image-generate stream ended without a result event.",
    );
  }
  return { files: complete.files ?? [] };
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
