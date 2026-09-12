/** Local-only CSV normalization for Vault's first password-manager import. */
import Papa from "papaparse";

import type { VaultExpectedActor } from "./vault-service";
import type { VaultItemCreateRequest, VaultPrincipal } from "./types";

export type CsvImportLimits = {
  maxFileBytes: number;
  maxRecords: number;
  maxColumns: number;
  maxCellBytes: number;
};
export type CsvColumnRole =
  "title" | "username" | "password" | "url" | "notes" | "otp" | "keep";
export type CsvImportRow = {
  rowNumber: number;
  cells: string[];
  issue?: "invalid" | "unsupported";
};
export type CsvImportPreview = {
  headers: string[];
  rows: CsvImportRow[];
  issues: number;
};
export type CsvImportCommand = {
  rowId: string;
  body: VaultItemCreateRequest;
  expectedActor: VaultExpectedActor;
};
export type CsvImportOutcome = {
  imported: number;
  skipped: number;
  failed: number;
  cancelled: boolean;
};

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined")
    return new TextEncoder().encode(value).byteLength;
  return unescape(encodeURIComponent(value)).length;
}

export function parseCsvText(
  text: string,
  limits: CsvImportLimits,
): CsvImportPreview {
  if (utf8ByteLength(text) > limits.maxFileBytes)
    throw new Error("The file exceeds this organization’s import size limit.");
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter: ",",
    skipEmptyLines: "greedy",
  });
  if (
    parsed.errors.some(
      (error) =>
        error.code !== "TooFewFields" && error.code !== "TooManyFields",
    )
  )
    throw new Error("The CSV could not be read. Fix the file and try again.");
  return validateParsedCsv(parsed.data, limits);
}

function validateParsedCsv(
  parsed: string[][],
  limits: CsvImportLimits,
): CsvImportPreview {
  const [headers, ...data] = parsed;
  if (!headers?.length || headers.length > limits.maxColumns)
    throw new Error("The CSV has an unsupported number of columns.");
  if (data.length > limits.maxRecords)
    throw new Error("The CSV has more records than this organization allows.");
  let issues = 0;
  const rows = data.map((cells, index) => {
    const invalid =
      cells.length !== headers.length ||
      cells.some((cell) => utf8ByteLength(cell) > limits.maxCellBytes);
    if (invalid) issues += 1;
    return {
      rowNumber: index + 2,
      cells,
      issue: invalid ? ("invalid" as const) : undefined,
    };
  });
  return { headers, rows, issues };
}

export function parseCsvFile(
  file: File,
  limits: CsvImportLimits,
): Promise<CsvImportPreview> {
  if (file.size > limits.maxFileBytes)
    return Promise.reject(
      new Error("The file exceeds this organization’s import size limit."),
    );
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      worker: true,
      delimiter: ",",
      skipEmptyLines: "greedy",
      complete: (result) => {
        if (
          result.errors.some(
            (error) =>
              error.code !== "TooFewFields" && error.code !== "TooManyFields",
          )
        ) {
          reject(
            new Error("The CSV could not be read. Fix the file and try again."),
          );
          return;
        }
        try {
          resolve(validateParsedCsv(result.data, limits));
        } catch (error) {
          reject(error);
        }
      },
      error: () =>
        reject(
          new Error("The CSV could not be read. Fix the file and try again."),
        ),
    });
  });
}

export function suggestedCsvMapping(headers: string[]): CsvColumnRole[] {
  return headers.map((header) => {
    const key = header.trim().toLowerCase();
    if (/^(name|title|label)$/.test(key)) return "title";
    if (/user(name)?|login|email/.test(key)) return "username";
    if (/pass(word)?/.test(key)) return "password";
    if (/uri|url|website|login_url/.test(key)) return "url";
    if (/note/.test(key)) return "notes";
    if (/otp|totp|one.?time/.test(key)) return "otp";
    return "keep";
  });
}

function fieldKey(index: number, used: Set<string>): string {
  const base = `import_column_${index + 1}`;
  let key = base;
  let suffix = 2;
  while (used.has(key)) key = `${base}_${suffix++}`;
  used.add(key);
  return key;
}

function roleValue(
  row: CsvImportRow,
  mapping: CsvColumnRole[],
  role: CsvColumnRole,
): string | null {
  const index = mapping.findIndex((entry) => entry === role);
  return index < 0 ? null : (row.cells[index] ?? "");
}

export function hasAmbiguousCsvMapping(mapping: CsvColumnRole[]): boolean {
  return (["title", "username", "password", "notes", "otp"] as const).some(
    (role) => mapping.filter((entry) => entry === role).length > 1,
  );
}

export function toCsvImportCommand(input: {
  source: string;
  preview: CsvImportPreview;
  row: CsvImportRow;
  mapping: CsvColumnRole[];
  principal: VaultPrincipal;
  expectedActor: VaultExpectedActor;
  rowId: string;
}): CsvImportCommand | null {
  if (input.row.issue) return null;
  const { headers } = input.preview;
  const { row, mapping } = input;
  const title =
    roleValue(row, mapping, "title") || `Imported credential ${row.rowNumber}`;
  const urls = row.cells
    .filter((_, index) => mapping[index] === "url")
    .filter(Boolean);
  const fields: NonNullable<VaultItemCreateRequest["fields"]> = [];
  const used = new Set<string>();
  const add = (field_key: string, value: string, editable = true) => {
    if (!value) return;
    used.add(field_key);
    fields.push({
      field_key,
      value,
      handling: "revealable",
      editable,
      inject_into_sandbox: false,
    });
  };
  add("username", roleValue(row, mapping, "username") ?? "");
  add("password", roleValue(row, mapping, "password") ?? "");
  add("import_notes", roleValue(row, mapping, "notes") ?? "");
  for (let index = 0; index < row.cells.length; index += 1) {
    if (mapping[index] === "keep")
      add(fieldKey(index, used), row.cells[index] ?? "");
  }
  // OTP stays solely in this sealed source representation until explicit enrollment.
  add(
    "import_source_record",
    JSON.stringify({
      source_vendor: input.source,
      format: "csv",
      cells: row.cells.map((value: string, column_index: number) => ({
        column_index,
        header: headers[column_index] ?? "",
        value,
      })),
    }),
    false,
  );
  return {
    rowId: input.rowId,
    expectedActor: input.expectedActor,
    body: {
      principal:
        input.principal.type === "organization"
          ? {
              type: "organization",
              organization_id: input.principal.organizationId,
            }
          : { type: "user" },
      display_name: title,
      definition_key: "website_login",
      source: "system_import",
      login_urls: urls,
      uri_match_mode: "never",
      browser_fill_enabled: false,
      fields,
    },
  };
}

/** Dispatch only one immutable command at a time; cancellation never rolls back a committed row. */
export async function runCsvImportCommands(
  commands: Array<CsvImportCommand | null>,
  dispatch: (command: CsvImportCommand) => Promise<void>,
  cancelled: () => boolean,
): Promise<CsvImportOutcome> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const command of commands) {
    if (cancelled()) return { imported, skipped, failed, cancelled: true };
    if (!command) {
      skipped += 1;
      continue;
    }
    try {
      await dispatch(command);
      imported += 1;
    } catch {
      failed += 1;
    }
  }
  return { imported, skipped, failed, cancelled: cancelled() };
}
