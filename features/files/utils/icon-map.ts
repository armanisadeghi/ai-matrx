/**
 * features/files/utils/icon-map.ts
 *
 * Icon + category lookup. **The data lives in [./file-types.ts](./file-types.ts)** —
 * this module is now a thin re-export so legacy callers (`getFileTypeDetails`,
 * `getFolderTypeDetails`, the `FileTypeDetails` shape) keep working without
 * encoding a parallel icon table.
 *
 * Add a new icon / color / category by editing `file-types.ts`. Do NOT extend
 * this file.
 */

export {
  getFileTypeDetails,
  getFilePreviewProfile,
  getFolderTypeDetails,
} from "./file-types";

export type { FileCategory, FileTypeDetails, PreviewKind } from "./file-types";
