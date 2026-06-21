/**
 * File reference fences — `FileRef { file_id, label? }` (not RecordRef).
 *
 * Backend resolves via FileManager / MediaRef (owner-scoped). Wire type is `"file"`.
 */

import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";

export interface FileReferenceArgs {
  fileId: string;
  label?: string;
}

/** Build the canonical ```matrx``` fence for one cloud file reference. */
export function buildFileReferenceFence(args: FileReferenceArgs): string {
  const item: Record<string, string> = { file_id: args.fileId };
  const label = args.label?.trim();
  if (label) item.label = label;
  return buildReferenceFence({
    type: "file",
    items: [item as ReferenceItem],
  });
}

/** Build one fence carrying N file references. */
export function buildMultiFileReferenceFence(
  files: ReadonlyArray<FileReferenceArgs>,
): string {
  if (files.length === 0) return "";
  if (files.length === 1) return buildFileReferenceFence(files[0]!);
  const items = files.map((f) => {
    const item: Record<string, string> = { file_id: f.fileId };
    const label = f.label?.trim();
    if (label) item.label = label;
    return item as ReferenceItem;
  });
  return buildReferenceFence({ type: "file", items });
}
