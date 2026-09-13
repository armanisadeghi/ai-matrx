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

export type StructuredImportWorkerSuccess = {
  ok: true;
  requestId: string;
  records: StructuredImportRecord[];
  binaryMemberCount: number;
};

export type StructuredImportWorkerFailure = {
  ok: false;
  requestId: string;
  error: string;
};

export type StructuredImportWorkerResponse =
  StructuredImportWorkerSuccess | StructuredImportWorkerFailure;
