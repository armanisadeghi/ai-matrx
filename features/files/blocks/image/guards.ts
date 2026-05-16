/**
 * features/files/blocks/image/guards.ts
 *
 * Runtime type guards for `UnifiedImageBlock` and its two variants.
 *
 * These guards exist so consumers never have to write
 * `value as UnifiedImageBlock` — a cast that silently lies if the field
 * shape doesn't match. Use the guard instead:
 *
 *     if (!isUnifiedImageBlock(block.data)) return null;
 *     // block.data is now narrowed to UnifiedImageBlock by TypeScript.
 *
 * The boundary adapters in `adapters/*` produce a true `UnifiedImageBlock`,
 * but by the time the data sits in Redux it's typed as
 * `Record<string, unknown>` (or similar opaque shape), so we need a runtime
 * check at every read site to recover the typed shape.
 *
 * Cheap structural check — discriminator `origin` + the variant-required
 * fields. The renderer / hook / persistence callsites all tolerate missing
 * optional fields, so we deliberately don't enforce them here.
 */

import type {
  UnifiedImageBlock,
  MatrxImageBlock,
  ExternalImageBlock,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object";
}

export function isMatrxImageBlock(value: unknown): value is MatrxImageBlock {
  if (!isObject(value)) return false;
  if (value.origin !== "matrx") return false;
  return typeof value.fileId === "string" && typeof value.fileUri === "string";
}

export function isExternalImageBlock(
  value: unknown,
): value is ExternalImageBlock {
  if (!isObject(value)) return false;
  if (value.origin !== "external") return false;
  return typeof value.externalUrl === "string";
}

export function isUnifiedImageBlock(
  value: unknown,
): value is UnifiedImageBlock {
  return isMatrxImageBlock(value) || isExternalImageBlock(value);
}
