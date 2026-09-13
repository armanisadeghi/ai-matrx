import { parseProtonPassExport } from "../proton-pass";

const limits = {
  maxFileBytes: 100_000,
  maxRecords: 10,
  maxCellBytes: 10_000,
  maxJsonDepth: 64,
};
function source(item: object) {
  return JSON.stringify({
    version: "1.0.0",
    userId: "user",
    vaults: {
      share: { description: "", display: {}, name: "Vault", items: [item] },
    },
  });
}
function login(overrides: object = {}) {
  return {
    itemId: "item",
    shareId: "share",
    data: {
      type: "login",
      content: {
        itemEmail: "email@example.test",
        password: "secret",
        urls: ["https://example.test"],
        totpUri: "",
        passkeys: [],
        itemUsername: "person",
        autofillUrls: [{ url: "https://example.test", mode: 0 }],
      },
      extraFields: [],
      metadata: { name: "Example", note: "", itemUuid: "uuid" },
    },
    state: 1,
    aliasEmail: null,
    contentFormatVersion: 8,
    createTime: 1,
    modifyTime: 1,
    pinned: false,
    files: [],
    ...overrides,
  };
}
describe("Proton Pass export parser", () => {
  test("retains a current login source envelope losslessly", () => {
    const [record] = parseProtonPassExport(source(login()), limits);
    expect(record).toMatchObject({
      status: "supported",
      kind: "website_login",
      username: "person",
      urls: ["https://example.test"],
    });
    if (record?.status === "supported")
      expect(record.sourceRecord).toContain('"source_vendor":"proton_pass"');
  });
  test("keeps unsupported protected data source-free", () => {
    const [record] = parseProtonPassExport(
      source(
        login({
          data: {
            ...login().data,
            content: { ...(login().data as any).content, passkeys: [{}] },
          },
        }),
      ),
      limits,
    );
    expect(record).toMatchObject({ status: "unsupported" });
    expect(record).not.toHaveProperty("sourceRecord");
  });
});
