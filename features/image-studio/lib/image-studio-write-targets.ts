/**
 * Validation core for the `image_description` surface write target
 * (`matrx-user/image-studio`).
 *
 * PURE on purpose, and separate from the inline validation the two
 * conversion targets do in `ImageStudioShell`. Those two check a handful of
 * scalars against enums; this one has to RESOLVE WHICH SOURCE IMAGE the value
 * lands on before it can validate anything, which is the only genuinely
 * non-trivial rule on this surface and the one worth unit-reading on its own.
 *
 * Keeping it outside React is what makes the errors reach the agent: the
 * writeback seam (`applySurfaceWrite`) wraps the handler call and turns a
 * throw into the error envelope the agent reads and corrects from — but only
 * if the throw is SYNCHRONOUS. One raised inside a React `setState` updater
 * would fire during render, escape the seam, and reach the user as a crashed
 * component instead.
 *
 * Every message is written FOR A MODEL: it names the target, the key, the
 * legal shape, and the real values in play, so the next attempt is a fix and
 * not a guess.
 */

import type { ImageMetadata } from "../types";

/** The live studio state the validator resolves a write against. */
export interface ImageDescriptionContext {
  /**
   * Live source files, read through a ref — never a render closure. The seam
   * resolves every handler BEFORE the user confirms the first dialog, and a
   * `filename_base` write renames the very string the next call matches on.
   */
  files: ReadonlyArray<{
    id: string;
    originalName: string;
    filenameBase: string;
  }>;
  isProcessing: boolean;
  isSaving: boolean;
}

/**
 * The authored keys an agent may write per source image. `dominant_colors` is
 * deliberately absent — see the manifest docblock: those hex codes are
 * measured off the pixels by a model that can SEE the image, and an agent
 * reading only the surface scope would be inventing swatches.
 */
export const IMAGE_DESCRIPTION_KEYS = [
  "filename_base",
  "alt_text",
  "caption",
  "title",
  "description",
  "keywords",
] as const;

/** Free-text keys — every one of these is plain prose, never JSON. */
const TEXT_KEYS = [
  "filename_base",
  "alt_text",
  "caption",
  "title",
  "description",
] as const;

export interface ImageDescriptionWrite {
  /** Studio-local file id the patch lands on. */
  fileId: string;
  /** Original filename of the matched file, for logging / messages. */
  fileName: string;
  patch: Partial<ImageMetadata>;
}

/**
 * Resolve WHICH source image a write lands on.
 *
 * Studio files are browser-local `File` objects with no durable id until the
 * user saves, so the surface addresses them the way it REPORTS them: by
 * `name` (the original filename) or `filename_base` (the editable slug). The
 * match is case-insensitive and must be UNAMBIGUOUS — two files whose slugs
 * collide is a real state the agent must be told about rather than have
 * resolved by coin flip.
 */
function resolveFile(raw: unknown, ctx: ImageDescriptionContext) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "image_description.file expects the name of ONE source image as a non-empty string. Read source_files and pass a file's `name` or `filename_base` exactly.",
    );
  }
  if (ctx.files.length === 0) {
    throw new Error(
      "image_description: there are no source images in the studio. The user has to add an image before a description can be written — an agent cannot add one, because source files are browser-local File objects.",
    );
  }
  const needle = raw.trim().toLowerCase();
  const matches = ctx.files.filter(
    (f) =>
      f.originalName.toLowerCase() === needle ||
      f.filenameBase.toLowerCase() === needle,
  );
  if (matches.length === 0) {
    throw new Error(
      `image_description.file: no source image called "${raw}". Files currently in the studio: ${ctx.files
        .map((f) => `"${f.originalName}" (filename_base "${f.filenameBase}")`)
        .join(", ")}.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `image_description.file: "${raw}" matches ${matches.length} source images. Use the exact \`name\` from source_files to pick one.`,
    );
  }
  return matches[0];
}

/**
 * Validate one per-image description write and return the metadata patch to
 * hand to `updateImageMetadata` — the same function the Metadata panel's own
 * inputs call.
 */
export function validateImageDescriptionWrite(
  value: unknown,
  ctx: ImageDescriptionContext,
): ImageDescriptionWrite {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "image_description expects an object: { file, alt_text?, caption?, title?, description?, keywords?, filename_base? }. Pass the object itself, not a JSON-encoded string.",
    );
  }
  // Same guards the conversion targets use, for the same reason: a run in
  // flight is already uploading this file's metadata alongside its variants.
  if (ctx.isProcessing) {
    throw new Error(
      "A conversion is already running. image_description cannot be written while variants are being generated — wait for is_processing to be false, then write again.",
    );
  }
  if (ctx.isSaving) {
    throw new Error(
      "A save to the library is already running. image_description cannot be written until it finishes — the save is uploading this metadata right now.",
    );
  }

  const input = value as Record<string, unknown>;
  if (!("file" in input)) {
    throw new Error(
      "image_description requires `file` — which source image this description is for. Read source_files and pass a file's `name` or `filename_base`.",
    );
  }
  const target = resolveFile(input.file, ctx);

  const contentKeys = { ...input };
  delete contentKeys.file;

  if ("dominant_colors" in contentKeys) {
    throw new Error(
      "image_description does not accept `dominant_colors`. Those hex codes are measured off the image's pixels by the Describe with AI action, not authored — writing them from the surface scope would be inventing values. Write the text fields instead.",
    );
  }
  const unknown = Object.keys(contentKeys).filter(
    (k) => !(IMAGE_DESCRIPTION_KEYS as readonly string[]).includes(k),
  );
  if (unknown.length > 0) {
    throw new Error(
      `image_description got unsupported key(s): ${unknown.join(", ")}. Allowed keys: file | ${IMAGE_DESCRIPTION_KEYS.join(" | ")}.`,
    );
  }
  if (Object.keys(contentKeys).length === 0) {
    throw new Error(
      `image_description needs \`file\` plus at least one of: ${IMAGE_DESCRIPTION_KEYS.join(" | ")}.`,
    );
  }

  // Validate EVERY key before returning any of them — a partial apply on a
  // half-valid object would leave metadata nobody chose.
  const patch: Partial<ImageMetadata> = {};
  // Collected separately so the indexed write is typed as `string`: indexing
  // Partial<ImageMetadata> by the TEXT_KEYS union widens to `string & string[]`.
  const text: Partial<Record<(typeof TEXT_KEYS)[number], string>> = {};

  for (const key of TEXT_KEYS) {
    if (!(key in contentKeys)) continue;
    const raw = contentKeys[key];
    if (typeof raw !== "string") {
      throw new Error(
        `image_description.${key} expects PLAIN TEXT — not JSON and not a JSON-encoded string. Pass the sentence itself, e.g. "A copper kettle on a slate counter."`,
      );
    }
    if (key === "filename_base" && !raw.trim()) {
      throw new Error(
        "image_description.filename_base expects a non-empty string — it is the slug stem of every generated variant's filename. Omit the key to leave the current name alone.",
      );
    }
    text[key] = raw;
  }
  Object.assign(patch, text);

  if ("keywords" in contentKeys) {
    const raw = contentKeys.keywords;
    if (!Array.isArray(raw)) {
      throw new Error(
        'image_description.keywords expects an ARRAY of plain strings, e.g. ["copper kettle", "slate counter"]. It REPLACES the whole keyword list — read the file\'s `keywords` in source_files first if you mean to extend it.',
      );
    }
    const cleaned: string[] = [];
    for (const entry of raw) {
      if (typeof entry !== "string") {
        throw new Error(
          `image_description.keywords must contain only strings; got ${typeof entry}.`,
        );
      }
      const trimmed = entry.trim();
      if (!trimmed) continue;
      if (cleaned.includes(trimmed)) {
        throw new Error(
          `image_description.keywords contains "${trimmed}" more than once. The keyword chips are a set — send each keyword once.`,
        );
      }
      cleaned.push(trimmed);
    }
    patch.keywords = cleaned;
  }

  return { fileId: target.id, fileName: target.originalName, patch };
}
