import {
  hasAmbiguousCsvMapping,
  isPossibleDuplicateRow,
  parseCsvText,
  runCsvImportCommands,
  safeDestination,
  prepareCsvImportRow,
  suggestedCsvMapping,
  toCsvImportCommand,
  type CsvImportCommand,
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
    ).toEqual({ metadata: "https://example.test", host: "example.test" });
    expect(safeDestination("https://user:secret@example.test/a")).toEqual({
      metadata: null,
      host: null,
    });
  });

  test("compares possible duplicates by exact title and normalized login origin", () => {
    const preview = parseCsvText(
      "name,url\nExample,https://example.test/import/path",
      limits,
    );
    const row = preview.rows[0];
    if (!row) throw new Error("test fixture did not parse a row");
    expect(
      isPossibleDuplicateRow(
        row,
        preview,
        suggestedCsvMapping(preview.headers),
        [{ displayName: "Example", loginUrls: ["https://example.test/old"] }],
      ),
    ).toBe(true);
  });

  test("flags matching title-only records only when both records have no active origin", () => {
    const preview = parseCsvText("name,note\nExample,plain note", limits);
    const row = preview.rows[0];
    if (!row) throw new Error("test fixture did not parse a row");
    const mapping = suggestedCsvMapping(preview.headers);
    expect(
      isPossibleDuplicateRow(row, preview, mapping, [
        { displayName: "Example", loginUrls: [] },
      ]),
    ).toBe(true);
    expect(
      isPossibleDuplicateRow(row, preview, mapping, [
        { displayName: "Different", loginUrls: [] },
      ]),
    ).toBe(false);
    expect(
      isPossibleDuplicateRow(row, preview, mapping, [
        { displayName: "Example", loginUrls: ["https://example.test"] },
      ]),
    ).toBe(false);
  });

  test("stops on an ambiguous retry without dispatching the next frozen row", async () => {
    const calls: string[] = [];
    const command = {
      rowId: "00000000-0000-4000-8000-000000000001",
      body: { display_name: "one" },
      expectedActor: actor,
    } as CsvImportCommand;
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
    } as CsvImportCommand;
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
      definitive: false,
      progressCursor: 1,
    });
  });

  test("retries only the unresolved frozen command after a confirmed row", async () => {
    const first = {
      rowId: "00000000-0000-4000-8000-000000000001",
      body: { display_name: "one" },
      expectedActor: actor,
      hasOtp: false,
    } as CsvImportCommand;
    const second = {
      rowId: "00000000-0000-4000-8000-000000000002",
      body: { display_name: "two" },
      expectedActor: actor,
      hasOtp: false,
    } as CsvImportCommand;
    const firstCalls: string[] = [];
    const firstPass = await runCsvImportCommands(
      [first, second],
      async (entry) => {
        firstCalls.push(entry.rowId);
        return entry === first ? "committed" : "retryable";
      },
      () => false,
    );
    const retryCalls: string[] = [];
    const retry = await runCsvImportCommands(
      [first, second],
      async (entry) => {
        retryCalls.push(entry.rowId);
        return "committed";
      },
      () => false,
      firstPass.progressCursor,
    );
    expect(firstCalls).toEqual([first.rowId, second.rowId]);
    expect(retryCalls).toEqual([second.rowId]);
    expect(retry.progressCursor).toBe(2);
  });

  test("reports non-login, passkey, and attachment records as unsupported", () => {
    const preview = parseCsvText(
      "name,type,passkey,attachment\nLogin,login,,\nPasskey,login,credential,\nFile,file,,backup.zip",
      limits,
    );
    expect(preview.rows.map((row) => row.issue)).toEqual([
      undefined,
      "unsupported",
      "unsupported",
    ]);
  });

  test("keeps profile columns encrypted instead of misclassifying them as files", () => {
    const preview = parseCsvText("name,profile\nExample,private", limits);
    const row = preview.rows[0];
    if (!row) throw new Error("test fixture did not parse a row");
    const prepared = prepareCsvImportRow({
      source: "generic",
      preview,
      row,
      mapping: suggestedCsvMapping(preview.headers),
      principal: { type: "user" },
      expectedActor: actor,
      rowId: "00000000-0000-4000-8000-000000000003",
      limits,
    });
    expect(row.issue).toBeUndefined();
    expect(prepared).toMatchObject({
      status: "ready",
      command: {
        body: {
          fields: expect.arrayContaining([
            expect.objectContaining({
              field_key: "import_column_2",
              value: "private",
            }),
          ]),
        },
      },
    });
  });

  test("refuses normalized rows over the configured limit before dispatch", () => {
    const preview = parseCsvText("name,password\nExample,secret", limits);
    const row = preview.rows[0];
    if (!row) throw new Error("test fixture did not parse a row");
    expect(
      prepareCsvImportRow({
        source: "generic",
        preview,
        row,
        mapping: suggestedCsvMapping(preview.headers),
        principal: { type: "user" },
        expectedActor: actor,
        rowId: "00000000-0000-4000-8000-000000000004",
        limits: { ...limits, maxPlaintextFieldBytes: 4 },
      }),
    ).toEqual({
      status: "invalid",
      diagnostic: "Row 2 exceeds this organization’s encrypted field limit.",
    });
  });

  test("refuses normalized rows over the configured request body limit", () => {
    const preview = parseCsvText("name,password\nExample,secret", limits);
    const row = preview.rows[0];
    if (!row) throw new Error("test fixture did not parse a row");
    expect(
      prepareCsvImportRow({
        source: "generic",
        preview,
        row,
        mapping: suggestedCsvMapping(preview.headers),
        principal: { type: "user" },
        expectedActor: actor,
        rowId: "00000000-0000-4000-8000-000000000005",
        limits: { ...limits, maxRequestBodyBytes: 32 },
      }),
    ).toEqual({
      status: "invalid",
      diagnostic: "Row 2 exceeds this organization’s request size limit.",
    });
  });

  test("requires username, password, HTTPS, and opt-in before browser fill", () => {
    const preview = parseCsvText(
      "name,username,password,url\nExample,user,secret,https://example.test/path",
      limits,
    );
    const row = preview.rows[0];
    if (!row) throw new Error("test fixture did not parse a row");
    const common = {
      source: "generic",
      preview,
      row,
      mapping: suggestedCsvMapping(preview.headers),
      principal: { type: "user" } as const,
      expectedActor: actor,
      rowId: "00000000-0000-4000-8000-000000000001",
      limits,
    };
    expect(toCsvImportCommand(common)?.body).toMatchObject({
      login_urls: ["https://example.test"],
      browser_fill_enabled: false,
    });
    expect(
      toCsvImportCommand({ ...common, browserFillEnabled: true })?.body,
    ).toMatchObject({ browser_fill_enabled: true, uri_match_mode: "host" });
    const noPassword = parseCsvText(
      "name,username,password,url\nExample,user,,https://example.test",
      limits,
    );
    const missingPasswordRow = noPassword.rows[0];
    if (!missingPasswordRow)
      throw new Error("test fixture did not parse a row");
    expect(
      toCsvImportCommand({
        ...common,
        preview: noPassword,
        row: missingPasswordRow,
        mapping: suggestedCsvMapping(noPassword.headers),
        browserFillEnabled: true,
      })?.body,
    ).toMatchObject({ browser_fill_enabled: false, uri_match_mode: "never" });
    const local = parseCsvText(
      "name,username,password,url\nLocal,user,secret,http://localhost:3000/login",
      limits,
    );
    const localRow = local.rows[0];
    if (!localRow) throw new Error("test fixture did not parse a row");
    expect(
      toCsvImportCommand({
        ...common,
        preview: local,
        row: localRow,
        mapping: suggestedCsvMapping(local.headers),
        browserFillEnabled: true,
      })?.body.browser_fill_enabled,
    ).toBe(true);
  });
});
