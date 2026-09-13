import { parseOnePuxData } from "../onepux";

const attrs = '{"version":3,"description":"1Password Unencrypted Export","createdAt":1}';
const item = (state = "active", id = "item") => `{"uuid":"${id}","favIndex":0,"createdAt":1,"updatedAt":1,"state":"${state}","categoryUuid":"001","overview":{"title":"Example","subtitle":"","url":"https://example.com","urls":[{"label":"other","url":"https://two.example"}]},"details":{"loginFields":[{"id":"u","name":"user","value":"me","fieldType":"T","designation":"username"},{"id":"p","name":"pass","value":"secret","fieldType":"P","designation":"password"}]}}`;
const data = (items = item()) => `{"accounts":[{"attrs":{"accountName":"a","name":"a","avatar":"","email":"a@b.c","uuid":"account","domain":"x"},"vaults":[{"attrs":{"uuid":"vault","desc":"","avatar":"","name":"P","type":"P"},"items":[${items}]}]}]}`;
const limits = { maxFileBytes: 100000, maxRecords: 20 };

describe("sanitized upstream 1PUX ordinary login shape", () => {
  test("projects destinations, preserves source envelope, and tracks archived lifecycle", () => {
    const [record] = parseOnePuxData(attrs, data(item("archived")), limits);
    expect(record).toMatchObject({ status: "supported", sourceState: "archived", kind: "website_login", urls: ["https://example.com", "https://two.example"], username: "me", password: "secret" });
    if (record?.status === "supported") expect(record.sourceRecord).toContain('"source_vendor":"1password"');
  });
  test("refuses unknown item fields without retaining a source", () => {
    const [record] = parseOnePuxData(attrs, data(item().replace('"details"', '"passkey":{},"details"')), limits);
    expect(record).toEqual(expect.objectContaining({ status: "unsupported" }));
    expect(record).not.toHaveProperty("sourceRecord");
  });
  test.each([
    ["bad state", item().replace('"state":"active"', '"state":"deleted"')],
    ["wrong category", item().replace('"categoryUuid":"001"', '"categoryUuid":"002"')],
    ["non-null document", item().replace('"loginFields"', '"documentAttributes":{},"loginFields"')],
    ["duplicate designation", item().replace('"designation":"password"', '"designation":"username"')],
    ["bad history", item().replace('"loginFields"', '"passwordHistory":[{"value":"x","time":"1"}],"loginFields"')],
  ])("classifies item rule: %s", (_name, mutated) => {
    const [record] = parseOnePuxData(attrs, data(mutated), limits);
    expect(record?.status).not.toBe("supported");
    expect(record).not.toHaveProperty("sourceRecord");
  });
  test("retains a fully classified section and history in its canonical envelope", () => {
    const fields = '"sections":[{"title":"extra","name":null,"hideAddAnotherField":false,"fields":[{"title":"label","id":"f","guarded":false,"multiline":false,"dontGenerate":false,"inputTraits":{"keyboard":"text","correction":"yes","capitalization":"none"},"value":{"email":{"email_address":"a@b.c","provider":null}}}]}],"passwordHistory":[{"value":"old","time":1}],';
    const [record] = parseOnePuxData(attrs, data(item().replace('"loginFields"', `${fields}"loginFields"`)), limits);
    expect(record?.status).toBe("supported");
    if (record?.status === "supported") expect(record.sourceRecord).toContain('"passwordHistory"');
  });
  test("sets OTP only from a nonempty section totp value", () => {
    const section = '"sections":[{"title":"extra","fields":[{"title":"otp","id":"otp","guarded":false,"multiline":false,"dontGenerate":false,"inputTraits":{"keyboard":"text","correction":"yes","capitalization":"none"},"value":{"totp":"otpauth://x"}}]}],';
    const [record] = parseOnePuxData(attrs, data(item().replace('"loginFields"', `${section}"loginFields"`)), limits);
    expect(record).toMatchObject({ status: "supported", hasOtp: true });
    const [guessed] = parseOnePuxData(attrs, data(item().replace('"fieldType":"T","designation":"username"', '"fieldType":"T","designation":null')), limits);
    expect(guessed).toMatchObject({ status: "supported", hasOtp: false });
  });
  test("refuses an overlong known item string without a source record", () => {
    const [record] = parseOnePuxData(attrs, data(item().replace('"Example"', `"${"x".repeat(80)}"`)), { ...limits, maxCellBytes: 40 });
    expect(record).toEqual(expect.objectContaining({ status: "invalid", title: "Item 1" }));
    expect(record).not.toHaveProperty("sourceRecord");
  });
  test("rejects missing traits and classifies unknown login field types unsupported", () => {
    const section = '"sections":[{"title":"x","fields":[{"title":"x","id":"x","guarded":false,"multiline":false,"dontGenerate":false,"inputTraits":{"keyboard":"x","correction":"x"},"value":{"string":"x"}}]}],';
    const [invalid] = parseOnePuxData(attrs, data(item().replace('"loginFields"', `${section}"loginFields"`)), limits);
    expect(invalid).toMatchObject({ status: "invalid" }); expect(invalid).not.toHaveProperty("sourceRecord");
    const [unsupported] = parseOnePuxData(attrs, data(item().replace('"fieldType":"T"', '"fieldType":"UNKNOWN"')), limits);
    expect(unsupported).toMatchObject({ status: "unsupported" }); expect(unsupported).not.toHaveProperty("sourceRecord");
  });
  test("dedupes safe URL metadata in source order", () => {
    const [record] = parseOnePuxData(attrs, data(item().replace('"https://two.example"', '"https://example.com/path"')), limits);
    expect(record).toMatchObject({ status: "supported", urls: ["https://example.com"] });
  });
  test.each([
    ["unknown value", '"value":{"sshKey":"x"}'],
    ["multiple values", '"value":{"string":"x","url":"x"}'],
    ["bad traits", '"inputTraits":{"keyboard":"x"}'],
  ])("refuses section field rule: %s", (_name, mutation) => {
    const section = `"sections":[{"title":"x","fields":[{"title":"x","id":"x","guarded":false,"multiline":false,"dontGenerate":false,"inputTraits":{"keyboard":"x","correction":"x","capitalization":"x"},"value":{"string":"x"}}]}],`;
    expect(() => parseOnePuxData(attrs, data(item().replace('"loginFields"', `${section}"loginFields"`).replace('"value":{"string":"x"}', mutation).replace('"inputTraits":{"keyboard":"x","correction":"x","capitalization":"x"}', mutation)), limits)).toThrow();
  });
  test("rejects duplicate vault item identities", () => expect(() => parseOnePuxData(attrs, data(`${item("active", "same")},${item("active", "same")}`), limits)).toThrow("duplicate item IDs"));
  test.each([
    ["missing root accounts", attrs, '{}'],
    ["unknown root key", attrs, data().replace('{"accounts"', '{"extra":true,"accounts"')],
    ["wrong export primitive", attrs.replace('"createdAt":1', '"createdAt":"1"'), data()],
    ["missing account attr", attrs, data().replace(',"domain":"x"', '')],
    ["unknown vault attr", attrs, data().replace('"type":"P"', '"type":"P","extra":"x"')],
    ["wrong vault type", attrs, data().replace('"type":"P"', '"type":"X"')],
  ])("rejects closed export shape: %s", (_name, attributes, exportData) => {
    expect(() => parseOnePuxData(attributes, exportData, limits)).toThrow();
  });
  test("allows the same bare item id in separate vaults but rejects duplicate vault ids", () => {
    const second = data(item("active", "same")).replace('"vault"', '"vault-two"');
    const joined = second.replace('"vaults":[', `"vaults":[{"attrs":{"uuid":"vault","desc":"","avatar":"","name":"P","type":"P"},"items":[${item("active", "same")}]},`);
    expect(parseOnePuxData(attrs, joined, limits)).toHaveLength(2);
    expect(() => parseOnePuxData(attrs, joined.replace('"vault-two"', '"vault"'), limits)).toThrow();
  });
});
