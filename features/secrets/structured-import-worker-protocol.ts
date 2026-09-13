import type { CsvImportLimits } from "./csv-import";
import type { StructuredImportRecord } from "./structured-import";

/** Shared worker envelope for bounded structured-password-manager imports. */
export type StructuredImportWorkerLimits = Pick<
  CsvImportLimits,
  "maxFileBytes" | "maxRecords" | "maxCellBytes"
> & {
  maxJsonDepth: number;
};

export type StructuredImportWorkerRequest =
  | {
      type: "parse";
      requestId: string;
      file: Blob;
      limits: StructuredImportWorkerLimits;
    }
  | { type: "cancel"; requestId: string };

export const STRUCTURED_IMPORT_FILE_NOTICE_CODES = [
  "unsupported_archive_members",
  "unsupported_binary_definitions",
  "deleted_tombstones",
] as const;

export type StructuredImportFileNoticeCode =
  (typeof STRUCTURED_IMPORT_FILE_NOTICE_CODES)[number];

export type StructuredImportFileNotice = {
  code: StructuredImportFileNoticeCode;
  count: number;
};

/** Reject untrusted worker messages rather than displaying source-controlled text. */
export function hasValidStructuredImportFileNotices(
  value: unknown,
  maxCount: number,
): value is StructuredImportFileNotice[] {
  if (!Number.isSafeInteger(maxCount) || maxCount <= 0 || !Array.isArray(value) || value.length > 3)
    return false;
  const seen = new Set<string>();
  return value.every((notice) => {
    if (
      !notice ||
      typeof notice !== "object" ||
      Array.isArray(notice) ||
      !Object.hasOwn(notice, "code") ||
      !Object.hasOwn(notice, "count") ||
      Object.keys(notice).length !== 2 ||
      !STRUCTURED_IMPORT_FILE_NOTICE_CODES.includes(
        (notice as { code?: unknown }).code as StructuredImportFileNoticeCode,
      ) ||
      !Number.isSafeInteger((notice as { count?: unknown }).count) ||
      (notice as { count: number }).count <= 0 ||
      (notice as { count: number }).count > maxCount
    )
      return false;
    const code = (notice as { code: string }).code;
    if (seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

export type StructuredImportWorkerSuccess = {
  ok: true;
  requestId: string;
  records: StructuredImportRecord[];
  fileNotices: StructuredImportFileNotice[];
};

export type StructuredImportWorkerFailure = {
  ok: false;
  requestId: string;
  error: string;
};

export type StructuredImportWorkerResponse =
  StructuredImportWorkerSuccess | StructuredImportWorkerFailure;
