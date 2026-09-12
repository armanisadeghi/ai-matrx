import {
  hasAmbiguousCsvMapping,
  parseCsvText,
  runCsvImportCommands,
  safeDestination,
  suggestedCsvMapping,
  toCsvImportCommand,
} from "../csv-import";

const limits = {
  maxFileBytes: 100_000,
  maxRecords: 20,
  maxColumns: 20,
  maxCellBytes: 10_000,
  maxFields: 202,
  maxPlaintextFieldBytes: 1_048_576,
  maxRequestBodyBytes: 12_582_912,
};
const actor = {
  userId: "user-1",
  organizationId: "11111111-1111-4111-8111-111111111111",
};

describe("Vault CSV import", () => {
  test("preserves quoted multiline and unknown source cells only in encrypted fields", () => {
    const preview = parseCsvText(
      'name,username,password,note,custom\r\nExample,me,"p,ass","line one\nline two",=not-a-formula',
      limits,
    );
    const row = preview.rows[0];
    if (!row) throw new Error("test fixture did not parse a row");
    const command = toCsvImportCommand({
      source: "generic",
      preview,
      row,
      mapping: suggestedCsvMapping(preview.headers),
      principal: { type: "user" },
      expectedActor: actor,
      rowId: "00000000-0000-4000-8000-000000000001",
      limits,
    });
    expect(command?.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field_key: "password", value: "p,ass" }),
        expect.objectContaining({
          field_key: "import_notes",
          value: "line one\nline two",
        }),
        expect.objectContaining({
          field_key: "import_column_5",
          value: "=not-a-formula",
        }),
        expect.objectContaining({
          field_key: "import_source_record",
          editable: false,
        }),
      ]),
    );
    expect(command?.body.notes).toBeUndefined();
    expect(command?.body.browser_fill_enabled).toBe(false);
  });

  test("marks width mismatches without exposing cells in the issue", () => {
    const preview = parseCsvText("name,password\nonly-name", limits);
    expect(preview.rows[0]).toEqual({
      rowNumber: 2,
      cells: ["only-name"],
      issue: "invalid",
    });
  });

  test("requires a single semantic mapping for duplicated source columns", () => {
    expect(hasAmbiguousCsvMapping(["title", "title", "keep"])).toBe(true);
    expect(hasAmbiguousCsvMapping(["url", "url", "keep"])).toBe(false);
  });

  test("strips query and fragment metadata and refuses URL credentials", () => {
    expect(
      safeDestination("https://example.test/a?token=secret#fragment"),
    ).toEqual({ metadata: "https://example.test/a", host: "example.test" });
    expect(safeDestination("https://user:secret@example.test/a")).toEqual({
      metadata: null,
      host: null,
    });
  });

  test("stops on an ambiguous retry without dispatching the next frozen row", async () => {
    const calls: string[] = [];
    const command = {
      rowId: "00000000-0000-4000-8000-000000000001",
      body: { display_name: "one" },
      expectedActor: actor,
    } as never;
    const result = await runCsvImportCommands(
      [command, command],
      async (entry) => {
        calls.push(entry.rowId);
        return "retryable";
      },
      () => false,
    );
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({ imported: 0, failed: 1, cancelled: false });
  });

  test("stops dispatch after the current committed row when cancelled", async () => {
    const calls: string[] = [];
    let cancel = false;
    const command = {
      rowId: "00000000-0000-4000-8000-000000000001",
      body: { display_name: "one" },
      expectedActor: actor,
    } as never;
    const result = await runCsvImportCommands(
      [command, command],
      async () => {
        calls.push("sent");
        cancel = true;
        return "committed";
      },
      () => cancel,
    );
    expect(calls).toEqual(["sent"]);
    expect(result).toEqual({
      imported: 1,
      skipped: 0,
      failed: 0,
      cancelled: true,
    });
  });
});
