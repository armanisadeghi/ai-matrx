/** Local-only CSV normalization for Vault's first password-manager import. */
import Papa from "papaparse";

import { isLoopbackApiUrl } from "@/lib/api/service-routing";
import type { VaultExpectedActor } from "./vault-service";
import type { VaultItemCreateRequest, VaultPrincipal } from "./types";

export type CsvImportLimits = {
  maxFileBytes: number;
  maxRecords: number;
  maxColumns: number;
  maxCellBytes: number;
  maxFields: number;
  maxPlaintextFieldBytes: number;
  maxRequestBodyBytes: number;
  maxJsonDepth?: number;
  jsonWorkerTimeoutMs?: number;
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
  hasOtp: boolean;
};
export type CsvImportPreparation =
  | { status: "ready"; command: CsvImportCommand }
  | {
      status: "skipped";
      reason: "invalid" | "unsupported" | "possible_duplicate";
    }
  | { status: "invalid"; diagnostic: string };
export type CsvImportOutcome = {
  imported: number;
  skipped: number;
  failed: number;
  cancelled: boolean;
  definitive: boolean;
  /** The first command that was not confirmed. Reuse it on a same-session retry. */
  progressCursor: number;
};

export type CsvImportDispatch = "committed" | "retryable" | "definitive";

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
    skipEmptyLines: false,
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
  const nonLoginTypeColumn = headers.findIndex((header) =>
    /^(item )?(type|kind|category)$/i.test(header.trim()),
  );
  const unsupportedValueColumns = headers
    .map((header, index) =>
      /(?:^|[\s_-])(passkey|webauthn|fido|attachment|file)(?:$|[\s_-])/i.test(
        header.trim(),
      )
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  let issues = 0;
  const rows = data.map((cells, index) => {
    const invalid =
      cells.length !== headers.length ||
      cells.some((cell) => utf8ByteLength(cell) > limits.maxCellBytes) ||
      cells.every((cell) => cell.trim().length === 0);
    const type =
      nonLoginTypeColumn >= 0
        ? (cells[nonLoginTypeColumn] ?? "").trim().toLowerCase()
        : "";
    const unsupported =
      !invalid &&
      (unsupportedValueColumns.some((column) =>
        Boolean(cells[column]?.trim()),
      ) ||
        (Boolean(type) &&
          !/^(login|website|web|password|credential)$/.test(type)));
    if (invalid || unsupported) issues += 1;
    return {
      rowNumber: index + 2,
      cells,
      issue: invalid
        ? ("invalid" as const)
        : unsupported
          ? ("unsupported" as const)
          : undefined,
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
  return file.arrayBuffer().then((bytes) => {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("The CSV must be valid UTF-8.");
    }
    return new Promise<CsvImportPreview>((resolve, reject) =>
      Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
        worker: true,
        delimiter: ",",
        skipEmptyLines: false,
        complete: (result) => {
          if (
            result.errors.some(
              (error) =>
                error.code !== "TooFewFields" && error.code !== "TooManyFields",
            )
          ) {
            reject(
              new Error(
                "The CSV could not be read. Fix the file and try again.",
              ),
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
      }),
    );
  });
}

export function safeDestination(raw: string): {
  metadata: string | null;
  host: string | null;
} {
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol))
      return { metadata: null, host: null };
    if (parsed.username || parsed.password)
      return { metadata: null, host: null };
    return { metadata: parsed.origin, host: parsed.host };
  } catch {
    return { metadata: null, host: null };
  }
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

export function isPossibleDuplicateRow(
  row: CsvImportRow,
  preview: CsvImportPreview,
  mapping: CsvColumnRole[],
  existingItems: { displayName: string; loginUrls: string[] }[],
): boolean {
  if (row.issue) return false;
  const title =
    roleValue(row, mapping, "title") || `Imported credential ${row.rowNumber}`;
  const urls = row.cells
    .filter((_, index) => mapping[index] === "url")
    .map(safeDestination)
    .flatMap((destination) =>
      destination.metadata ? [destination.metadata] : [],
    );
  return existingItems.some(
    (item) =>
      item.displayName === title &&
      item.loginUrls
        .map(safeDestination)
        .some((destination) =>
          destination.metadata ? urls.includes(destination.metadata) : false,
        ),
  );
}

export function prepareCsvImportRow(input: {
  source: string;
  preview: CsvImportPreview;
  row: CsvImportRow;
  mapping: CsvColumnRole[];
  principal: VaultPrincipal;
  expectedActor: VaultExpectedActor;
  rowId: string;
  limits: CsvImportLimits;
  browserFillEnabled?: boolean;
  existingItems?: { displayName: string; loginUrls: string[] }[];
  skipPossibleDuplicate?: boolean;
}): CsvImportPreparation {
  if (input.row.issue === "invalid")
    return { status: "skipped", reason: "invalid" };
  if (input.row.issue === "unsupported")
    return { status: "skipped", reason: "unsupported" };
  if (
    input.skipPossibleDuplicate &&
    isPossibleDuplicateRow(
      input.row,
      input.preview,
      input.mapping,
      input.existingItems ?? [],
    )
  )
    return { status: "skipped", reason: "possible_duplicate" };
  const { headers } = input.preview;
  const { row, mapping } = input;
  const title =
    roleValue(row, mapping, "title") || `Imported credential ${row.rowNumber}`;
  const rawUrls = row.cells
    .filter((_, index) => mapping[index] === "url")
    .filter(Boolean);
  const urls = rawUrls
    .map(safeDestination)
    .flatMap((url) => (url.metadata ? [url.metadata] : []));
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
  // OTP stays only in the encrypted, revealable source representation until explicit enrollment.
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
  if (
    fields.length > input.limits.maxFields ||
    fields.some(
      (field) =>
        utf8ByteLength(field.value) > input.limits.maxPlaintextFieldBytes,
    )
  )
    return {
      status: "invalid",
      diagnostic: `Row ${row.rowNumber} exceeds this organization’s encrypted field limit.`,
    };
  const command: CsvImportCommand = {
    rowId: input.rowId,
    expectedActor: input.expectedActor,
    hasOtp: Boolean(roleValue(row, mapping, "otp")),
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
      browser_fill_enabled:
        Boolean(input.browserFillEnabled) &&
        Boolean(roleValue(row, mapping, "username")) &&
        Boolean(roleValue(row, mapping, "password")) &&
        urls.length > 0 &&
        urls.every(
          (url) => new URL(url).protocol === "https:" || isLoopbackApiUrl(url),
        ),
      fields,
    },
  };
  // The browser matcher treats `never` as an absolute refusal. Keep this pair
  // coherent with the explicit, eligible bulk opt-in rather than advertising a
  // fill capability the canonical matcher will always reject.
  if (command.body.browser_fill_enabled) command.body.uri_match_mode = "host";
  if (
    utf8ByteLength(JSON.stringify(command.body)) >
    input.limits.maxRequestBodyBytes
  )
    return {
      status: "invalid",
      diagnostic: `Row ${row.rowNumber} exceeds this organization’s request size limit.`,
    };
  return { status: "ready", command };
}

/** Compatibility helper for callers that only need a command after preparation. */
export function toCsvImportCommand(
  input: Parameters<typeof prepareCsvImportRow>[0],
): CsvImportCommand | null {
  const prepared = prepareCsvImportRow(input);
  return prepared.status === "ready" ? prepared.command : null;
}

/** Dispatch only one immutable command at a time; cancellation never rolls back a committed row. */
export async function runCsvImportCommands(
  commands: Array<CsvImportCommand | null>,
  dispatch: (command: CsvImportCommand) => Promise<CsvImportDispatch>,
  cancelled: () => boolean,
  progressCursor = 0,
): Promise<CsvImportOutcome> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (let index = progressCursor; index < commands.length; index += 1) {
    const command = commands[index];
    if (cancelled())
      return {
        imported,
        skipped,
        failed,
        cancelled: true,
        definitive: false,
        progressCursor: index,
      };
    if (!command) {
      skipped += 1;
      continue;
    }
    const result = await dispatch(command);
    if (result === "committed") {
      imported += 1;
      continue;
    }
    failed += 1;
    // A retryable or definitive outcome retains this exact command/UUID for review.
    return {
      imported,
      skipped,
      failed,
      cancelled: result === "definitive" || cancelled(),
      definitive: result === "definitive",
      progressCursor: index,
    };
  }
  return {
    imported,
    skipped,
    failed,
    cancelled: cancelled(),
    definitive: false,
    progressCursor: commands.length,
  };
}
