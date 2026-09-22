import {
  hasAmbiguousCsvMapping,
  parseCsvText,
  prepareCsvImportRow,
  suggestedCsvMapping,
} from "../csv-import";

const limits = {
  maxFileBytes: 100_000,
  maxRecords: 20,
  maxColumns: 30,
  maxCellBytes: 10_000,
  maxFields: 202,
  maxPlaintextFieldBytes: 1_048_576,
  maxRequestBodyBytes: 12_582_912,
};

const headers = [
  "name",
  "url",
  "username",
  "password",
  "note",
  "cardholdername",
  "cardnumber",
  "cvc",
  "expirydate",
  "zipcode",
  "folder",
  "full_name",
  "phone_number",
  "email",
  "address1",
  "address2",
  "city",
  "country",
  "state",
  "totp",
  "shared_folder",
];

describe("NordPass CSV template compatibility", () => {
  test("maps an ordinary login while preserving non-login data as revealable import material", () => {
    const csv = [
      headers.join(","),
      [
        "Example",
        "https://example.com/login",
        "person@example.com",
        "secret",
        "A useful note",
        "Example Person",
        "4111111111111111",
        "123",
        "12/30",
        "90210",
        "Personal",
        "Example Person",
        "+1 555 0100",
        "person@example.com",
        "1 Main St",
        "Unit 2",
        "Los Angeles",
        "US",
        "CA",
        "otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP",
        "",
      ].join(","),
    ].join("\n");

    const preview = parseCsvText(csv, limits);
    const mapping = suggestedCsvMapping(preview.headers, "nordpass");
    expect(mapping).toEqual([
      "title", "url", "username", "password", "notes",
      ...Array(14).fill("keep"), "otp", "keep",
    ]);
    expect(hasAmbiguousCsvMapping(mapping)).toBe(false);
    expect(hasAmbiguousCsvMapping(suggestedCsvMapping(["username", "email"]))).toBe(true);
    const row = preview.rows[0];
    if (!row) throw new Error("missing NordPass login row");

    const prepared = prepareCsvImportRow({
      source: "nordpass",
      preview,
      row,
      mapping,
      principal: { type: "user" },
      expectedActor: { userId: "user", organizationId: "org" },
      rowId: "00000000-0000-4000-8000-000000000001",
      limits,
      browserFillEnabled: false,
    });

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") throw new Error("missing import command");
    expect(prepared.command.hasOtp).toBe(true);
    expect(prepared.command.body).toMatchObject({
      display_name: "Example",
      login_urls: ["https://example.com"],
      browser_fill_enabled: false,
      uri_match_mode: "never",
    });
    expect(prepared.command.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field_key: "username", value: "person@example.com" }),
        expect.objectContaining({ field_key: "password", value: "secret" }),
        expect.objectContaining({ field_key: "import_notes", value: "A useful note" }),
      ]),
    );

    const fields = prepared.command.body.fields ?? [];
    expect(fields.filter((field) => field.field_key.startsWith("import_column_")).every((field) => field.handling === "revealable" && field.inject_into_sandbox === false)).toBe(true);
    expect(fields.map((field) => field.field_key)).not.toEqual(expect.arrayContaining(["cardnumber", "cvc", "totp", "phone_number"]));
    const sourceRecord = fields.find((field) => field.field_key === "import_source_record");
    expect(sourceRecord).toMatchObject({ handling: "revealable", editable: false, inject_into_sandbox: false });
    expect(sourceRecord?.value).toContain('"source_vendor":"nordpass"');
    expect(sourceRecord?.value).toContain('"header":"totp"');
    expect(sourceRecord?.value).toContain("otpauth://totp/Example");

    const optedIn = prepareCsvImportRow({
      source: "nordpass",
      preview,
      row,
      mapping,
      principal: { type: "user" },
      expectedActor: { userId: "user", organizationId: "org" },
      rowId: "00000000-0000-4000-8000-000000000002",
      limits,
      browserFillEnabled: true,
    });
    expect(optedIn.status).toBe("ready");
    if (optedIn.status === "ready") {
      expect(optedIn.command.body.browser_fill_enabled).toBe(true);
      expect(optedIn.command.body.uri_match_mode).toBe("host");
    }
  });
});
