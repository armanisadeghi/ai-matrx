import { parseBitwardenExport } from "../bitwarden-json";
import { isPossibleStructuredImportDuplicate, prepareStructuredImportCommand } from "../structured-import";

const limits = { maxFileBytes: 100_000, maxRecords: 20, maxColumns: 20, maxCellBytes: 10_000, maxFields: 202, maxPlaintextFieldBytes: 1_048_576, maxRequestBodyBytes: 12_582_912, maxJsonDepth: 64 };
const source = (items: string) => `{\"encrypted\":false,\"folders\":[{\"id\":\"11111111-1111-4111-8111-111111111111\",\"name\":\"Personal\"}],\"items\":[${items}]}`;
const login = (extra = "") => `{\"id\":\"22222222-2222-4222-8222-222222222222\",\"name\":\"Example\",\"type\":1,\"folderId\":\"11111111-1111-4111-8111-111111111111\",\"login\":{\"username\":\"me\",\"password\":\" p@ss \",\"totp\":null,\"uris\":[{\"uri\":\"https://example.com/login\",\"match\":0}]}${extra ? `,${extra}` : ""}}`;

describe("plain Bitwarden JSON", () => {
  test("preserves source strings exactly and pairs browser-fill host mode with the opt-in", () => {
    const [record] = parseBitwardenExport(source(login('"notes":"unicode ✓ and 900719925474099312345"')), limits);
    if (!record) throw new Error("missing parsed record");
    const prepared = prepareStructuredImportCommand({ record, principal: { type: "user" }, expectedActor: { userId: "user", organizationId: "org" }, rowId: "00000000-0000-4000-8000-000000000001", browserFillEnabled: true, includeDeleted: false, includeArchived: false, limits });
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") throw new Error("missing command");
    expect(prepared.command.body).toMatchObject({ definition_key: "website_login", browser_fill_enabled: true, uri_match_mode: "host", login_urls: ["https://example.com"] });
    expect(prepared.command.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field_key: "password", value: " p@ss " }), expect.objectContaining({ field_key: "import_source_record", editable: false, value: expect.stringContaining("900719925474099312345") })]));
  });

  test("refuses duplicate keys, protected components, and out-of-range enums", () => {
    const duplicateKeyError = "The JSON export has duplicate keys or could not be read safely.";
    const rootCanary = '{"encrypted":false,"folders":[],"items":[],"encrypted":false}';
    const equalValueDuplicates = [
      rootCanary,
      '{"encrypted":false,"folders":[],"items":[],"marker":"same","marker":"same"}',
      '{"encrypted":false,"folders":[],"items":[],"marker":12345678901234567890,"marker":12345678901234567890}',
      '{"encrypted":false,"folders":[],"items":[],"marker":null,"marker":null}',
      '{"encrypted":false,"folders":[],"items":[],"marker":{"nested":[true,null]},"marker":{"nested":[true,null]}}',
      '{"encr\\u0079pted":false,"folders":[],"items":[],"encrypted":false}',
      '{"encrypted":false,"folders":[],"items":[{"name":"same","name":"same"}]}',
    ];
    for (const text of equalValueDuplicates) expect(() => parseBitwardenExport(text, limits)).toThrow(duplicateKeyError);
    expect(() => parseBitwardenExport('{"encrypted":false,"folders":[],"items":[],"marker":1,"marker":2}', limits)).toThrow(duplicateKeyError);
    expect(parseBitwardenExport(source(login()), limits)).toHaveLength(1);
    const [passkey] = parseBitwardenExport(source(login().replace('"uris":[{"uri":"https://example.com/login","match":0}]', '"uris":[],"fido2Credentials":[{}]')), limits);
    expect(passkey?.status).toBe("unsupported");
    const [bad] = parseBitwardenExport(source(login().replace('"match":0', '"match":900719925474099312345')), limits);
    expect(bad?.status).toBe("invalid");
  });

  test("maps an ordinary SSH key without sandbox injection and exposes only its public key metadata", () => {
    const [record] = parseBitwardenExport(source('{"id":"33333333-3333-4333-8333-333333333333","name":"deploy","type":5,"sshKey":{"privateKey":"PRIVATE","publicKey":"PUBLIC","keyFingerprint":"SHA256:x"}}'), limits);
    if (!record) throw new Error("missing SSH record");
    const prepared = prepareStructuredImportCommand({ record, principal: { type: "user" }, expectedActor: { userId: "user", organizationId: "org" }, rowId: "00000000-0000-4000-8000-000000000002", browserFillEnabled: false, includeDeleted: false, includeArchived: false, limits });
    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") throw new Error("missing command");
    expect(prepared.command.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field_key: "private_key", handling: "revealable", inject_into_sandbox: false }), expect.objectContaining({ field_key: "public_key", handling: "visible", inject_into_sandbox: false })]));
  });

  test("accounts for optional login members, schema variants, UTF-8 limits, and referenced folders", () => {
    const optional = parseBitwardenExport(source(login().replace('"username":"me","password":" p@ss ","totp":null,"uris":[{"uri":"https://example.com/login","match":0}]', "")), limits)[0];
    expect(optional?.status).toBe("supported");
    const secureNote = parseBitwardenExport(source('{"id":"33333333-3333-4333-8333-333333333333","name":"note","type":2,"secureNote":{"type":0}}'), limits)[0];
    expect(secureNote?.status).toBe("supported");
    const unknown = parseBitwardenExport(source(login('"unknown":"value"')), limits)[0];
    expect(unknown?.status).toBe("unsupported");
    const tiny = { ...limits, maxCellBytes: 100 };
    expect(parseBitwardenExport(source(login('"notes":"' + "✓".repeat(100) + '"')), tiny)[0]?.status).toBe("invalid");
    expect(optional?.sourceRecord).toContain('"folders"');
    expect(optional?.sourceRecord).toContain('"Personal"');
  });

  test("prepares one destination and accounts for possible duplicates before confirmation", () => {
    const [record] = parseBitwardenExport(source(login().replace('"https://example.com/login","match":0', '"https://example.com/login","match":0},{"uri":"https://second.example/login","match":0')), limits);
    if (!record) throw new Error("missing record");
    const prepared = prepareStructuredImportCommand({ record, principal: { type: "user" }, expectedActor: { userId: "user", organizationId: "org" }, rowId: "id", browserFillEnabled: true, includeDeleted: false, includeArchived: false, limits, existingItems: [{ displayName: "Example", loginUrls: ["https://example.com"] }], skipPossibleDuplicate: true });
    expect(prepared).toMatchObject({ status: "skipped", reason: "possible_duplicate" });
    const create = prepareStructuredImportCommand({ record, principal: { type: "user" }, expectedActor: { userId: "user", organizationId: "org" }, rowId: "id", browserFillEnabled: true, includeDeleted: false, includeArchived: false, limits, existingItems: [], skipPossibleDuplicate: false });
    expect(create.status).toBe("ready");
    if (create.status === "ready") expect(create.command.body.login_urls).toEqual(["https://example.com"]);
  });

  test("flags same-title no-origin notes and SSH keys as possible duplicates while preserving Create separately", () => {
    const [note] = parseBitwardenExport(source('{"id":"33333333-3333-4333-8333-333333333333","name":"Example","type":2,"secureNote":{"type":0}}'), limits);
    const [ssh] = parseBitwardenExport(source('{"id":"44444444-4444-4444-8444-444444444444","name":"deploy","type":5,"sshKey":{"privateKey":"PRIVATE","publicKey":"PUBLIC","keyFingerprint":"SHA256:x"}}'), limits);
    if (!note || !ssh) throw new Error("missing parsed records");
    expect(isPossibleStructuredImportDuplicate(note, [{ displayName: "Example", loginUrls: [] }])).toBe(true);
    expect(isPossibleStructuredImportDuplicate(ssh, [{ displayName: "deploy", loginUrls: [] }])).toBe(true);
    expect(isPossibleStructuredImportDuplicate(note, [{ displayName: "Different", loginUrls: [] }])).toBe(false);
    expect(isPossibleStructuredImportDuplicate(note, [{ displayName: "Example", loginUrls: ["https://example.test"] }])).toBe(false);
    expect(isPossibleStructuredImportDuplicate({ status: "unsupported", ordinal: note.ordinal, title: note.title, reason: "Unsupported" }, [{ displayName: "Example", loginUrls: [] }])).toBe(false);
    const skipped = prepareStructuredImportCommand({ record: note, principal: { type: "user" }, expectedActor: { userId: "user", organizationId: "org" }, rowId: "id", browserFillEnabled: false, includeDeleted: false, includeArchived: false, limits, existingItems: [{ displayName: "Example", loginUrls: [] }], skipPossibleDuplicate: true });
    expect(skipped).toMatchObject({ status: "skipped", reason: "possible_duplicate" });
    const create = prepareStructuredImportCommand({ record: note, principal: { type: "user" }, expectedActor: { userId: "user", organizationId: "org" }, rowId: "id", browserFillEnabled: false, includeDeleted: false, includeArchived: false, limits, existingItems: [{ displayName: "Example", loginUrls: [] }], skipPossibleDuplicate: false });
    expect(create.status).toBe("ready");
  });
});
