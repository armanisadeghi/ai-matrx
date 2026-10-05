/**
 * The package's own structural view of a file source / normalized file. The host's file handler
 * owns the full unions (`features/files/handler/types`); the package only builds the two shapes it
 * needs (`{ kind: "file_id" }`, `{ kind: "external_url" }`) and reads `meta.category`.
 */
export interface FileSource {
  kind: string;
  [key: string]: unknown;
}

export interface NormalizedFile {
  fileId?: string;
  url?: string;
  meta: { category?: string; mime?: string; [key: string]: unknown };
  [key: string]: unknown;
}
