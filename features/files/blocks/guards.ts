/**
 * features/files/blocks/guards.ts
 *
 * Runtime type guards for `UnifiedMediaBlock` and its variants. Used at
 * trust boundaries (Redux reads, adapter inputs) to prove the shape
 * rather than force-cast.
 *
 * All guards accept `unknown` so they're safe to use against raw
 * `Record<string, unknown>` data (e.g. `block.data` on a render-block
 * envelope, `block.metadata` on a free-form bag).
 */

import type {
  AudioBlock,
  DocumentBlock,
  ExternalImageBlock,
  ImageBlock,
  MatrxImageBlock,
  UnifiedMediaBlock,
  VideoBlock,
  YouTubeBlock,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

// ─── Discriminator probes ───────────────────────────────────────────────────

function hasMediaShape(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  if (typeof value.kind !== "string") return false;
  if (value.origin !== "matrx" && value.origin !== "external") return false;
  return true;
}

// ─── Origin guards (kind-agnostic) ──────────────────────────────────────────

export function isMatrxMediaBlock(
  value: unknown,
): value is Extract<UnifiedMediaBlock, { origin: "matrx" }> {
  if (!hasMediaShape(value)) return false;
  if (value.origin !== "matrx") return false;
  return typeof value.fileId === "string" && typeof value.fileUri === "string";
}

export function isExternalMediaBlock(
  value: unknown,
): value is Extract<UnifiedMediaBlock, { origin: "external" }> {
  if (!hasMediaShape(value)) return false;
  if (value.origin !== "external") return false;
  return typeof value.externalUrl === "string";
}

export function isUnifiedMediaBlock(
  value: unknown,
): value is UnifiedMediaBlock {
  return isMatrxMediaBlock(value) || isExternalMediaBlock(value);
}

// ─── Kind guards ────────────────────────────────────────────────────────────

export function isImageBlock(value: unknown): value is ImageBlock {
  return isUnifiedMediaBlock(value) && value.kind === "image";
}

export function isVideoBlock(value: unknown): value is VideoBlock {
  return isUnifiedMediaBlock(value) && value.kind === "video";
}

export function isAudioBlock(value: unknown): value is AudioBlock {
  return isUnifiedMediaBlock(value) && value.kind === "audio";
}

export function isDocumentBlock(value: unknown): value is DocumentBlock {
  return isUnifiedMediaBlock(value) && value.kind === "document";
}

export function isYouTubeBlock(value: unknown): value is YouTubeBlock {
  return isUnifiedMediaBlock(value) && value.kind === "youtube";
}

// ─── Cross-product guards for ergonomic narrowing ───────────────────────────

export function isMatrxImageBlock(value: unknown): value is MatrxImageBlock {
  return isImageBlock(value) && value.origin === "matrx";
}

export function isExternalImageBlock(
  value: unknown,
): value is ExternalImageBlock {
  return isImageBlock(value) && value.origin === "external";
}
