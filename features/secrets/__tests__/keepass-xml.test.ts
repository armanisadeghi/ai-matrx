import { parseKeePassXml } from "../keepass-xml";

const limits = { maxFileBytes: 100_000, maxRecords: 100, maxCellBytes: 10_000 };
const xml = (entry: string) => `<?xml version="1.0" encoding="UTF-8"?><KeePassFile><Meta><RecycleBinUUID>r</RecycleBinUUID></Meta><Root><Group><Name>Root</Name>${entry}</Group></Root></KeePassFile>`;
const entry = (extra = "") => `<Entry><String><Key>Title</Key><Value>Example</Value></String><String><Key>UserName</Key><Value>person</Value></String><String><Key>Password</Key><Value>secret</Value></String><String><Key>URL</Key><Value>https://example.test/login</Value></String>${extra}<History><Entry><String><Key>Title</Key><Value>old</Value></String></Entry></History></Entry>`;

describe("KeePass XML", () => {
  test("normalizes a nested login and keeps history in source provenance", () => {
    const out = parseKeePassXml(xml(`<Group><Name>Nested</Name>${entry()}</Group>`), limits);
    expect(out.records).toEqual([expect.objectContaining({ status: "supported", kind: "website_login", username: "person", password: "secret" })]);
    expect((out.records[0] as { sourceRecord: string }).sourceRecord).toContain("Nested");
  });
  test("rejects duplicate strings and DTD", () => {
    expect(parseKeePassXml(xml(entry(`<String><Key>Title</Key><Value>again</Value></String>`)), limits).records[0]).toEqual(expect.objectContaining({ status: "invalid" }));
    expect(() => parseKeePassXml(`<!DOCTYPE x>${xml(entry())}`, limits)).toThrow();
  });
  test("marks binaries and passkeys unsupported", () => {
    expect(parseKeePassXml(xml(entry("<Binary><Key>a</Key><Value Ref=\"0\"/></Binary>")), limits).records[0]).toEqual(expect.objectContaining({ status: "unsupported" }));
    expect(parseKeePassXml(xml(entry("<String><Key>KPEX_PASSKEY_USERNAME</Key><Value>x</Value></String>")), limits).records[0]).toEqual(expect.objectContaining({ status: "unsupported" }));
  });
});
