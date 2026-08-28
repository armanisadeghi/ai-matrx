/**
 * features/files/utils/mime.ts
 *
 * Mime-type helpers. **The data lives in [./file-types.ts](./file-types.ts)** —
 * this module is now a thin re-export so legacy callers keep working without
 * encoding a parallel mime table.
 *
 * Add a new MIME by adding the file type entry in `file-types.ts`. Do NOT
 * extend the helpers here.
 */

export {
  isAudioMime,
  isBrowserRenderableImageMime,
  isImageMime,
  isPdfMime,
  isTextMime,
  isVideoMime,
  mimeFromFilename,
  resolveMime,
} from "./file-types";
