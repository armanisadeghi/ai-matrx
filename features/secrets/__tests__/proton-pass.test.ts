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
            content: {
              ...(login().data as any).content,
              passkeys: [
                {
                  keyId: "",
                  content: "",
                  credentialId: "",
                  userHandle: "",
                  domain: "",
                  rpId: "",
                  rpName: "",
                  userName: "",
                  userDisplayName: "",
                  userId: "",
                  note: "",
                  createTime: 0,
                },
              ],
            },
          },
        }),
      ),
      limits,
    );
    expect(record).toMatchObject({ status: "unsupported" });
    expect(record).not.toHaveProperty("sourceRecord");
  });
  test("keeps mode-zero projection ordered and duplicate-preserving", () => {
    const [record] = parseProtonPassExport(
      source(
        login({
          data: {
            ...login().data,
            content: {
              ...(login().data as any).content,
              urls: ["https://example.test", "https://example.test"],
              autofillUrls: [
                { url: "https://example.test", mode: 0 },
                { url: "https://example.test", mode: 0 },
                { url: "https://ignored.test", mode: 1 },
              ],
            },
          },
        }),
      ),
      limits,
    );
    expect(record).toMatchObject({
      status: "supported",
      urls: ["https://example.test", "https://example.test"],
    });
  });
  test("rejects malformed protected passkey bytes without a source record", () => {
    const [record] = parseProtonPassExport(
      source(
        login({
          data: {
            ...login().data,
            content: {
              ...(login().data as any).content,
              passkeys: [
                {
                  keyId: "AA=A",
                  content: "",
                  credentialId: "",
                  userHandle: "",
                  domain: "",
                  rpId: "",
                  rpName: "",
                  userName: "",
                  userDisplayName: "",
                  userId: "",
                  note: "",
                  createTime: 0,
                },
              ],
            },
          },
        }),
      ),
      limits,
    );
    expect(record).toMatchObject({ status: "invalid" });
    expect(record).not.toHaveProperty("sourceRecord");
  });
  test("rejects unknown closed root keys as a file-level error", () => {
    expect(() =>
      parseProtonPassExport(
        JSON.stringify({ ...JSON.parse(source(login())), future: true }),
        limits,
      ),
    ).toThrow("invalid");
  });
  test("classifies future login enums and legacy omission as source-free unsupported", () => {
    const futureState = parseProtonPassExport(
      source(login({ state: 3 })),
      limits,
    )[0];
    const legacy = parseProtonPassExport(
      source(
        login({
          data: {
            ...login().data,
            content: Object.fromEntries(
              Object.entries((login().data as any).content).filter(
                ([key]) => key !== "autofillUrls",
              ),
            ),
          },
        }),
      ),
      limits,
    )[0];
    expect(futureState).toMatchObject({ status: "unsupported" });
    expect(legacy).toMatchObject({ status: "unsupported" });
    expect(futureState).not.toHaveProperty("sourceRecord");
    expect(legacy).not.toHaveProperty("sourceRecord");
  });
  test("classifies future URL and vault display enums as unsupported", () => {
    const mode = parseProtonPassExport(
      source(
        login({
          data: {
            ...login().data,
            content: {
              ...(login().data as any).content,
              autofillUrls: [{ url: "https://example.test", mode: 7 }],
            },
          },
        }),
      ),
      limits,
    )[0];
    const icon = parseProtonPassExport(
      JSON.stringify({
        version: "1",
        vaults: {
          share: {
            description: "",
            display: { icon: 32 },
            name: "Vault",
            items: [login()],
          },
        },
      }),
      limits,
    )[0];
    expect(mode).toMatchObject({ status: "unsupported" });
    expect(icon).toMatchObject({ status: "unsupported" });
    expect(icon).not.toHaveProperty("sourceRecord");
  });
  test("censuses duplicate identities before future vault display classification", () => {
    const payload = {
      version: "1",
      vaults: {
        share: {
          description: "",
          display: { icon: 32 },
          name: "Vault",
          items: [login(), login()],
        },
      },
    };
    expect(() =>
      parseProtonPassExport(JSON.stringify(payload), limits),
    ).toThrow("duplicate item identities");
  });
  test("makes malformed type primitives invalid while future type strings are unsupported", () => {
    const malformed = parseProtonPassExport(
      source(login({ data: { ...login().data, type: 7 } })),
      limits,
    )[0];
    const future = parseProtonPassExport(
      source(login({ data: { ...login().data, type: "futureType" } })),
      limits,
    )[0];
    expect(malformed).toMatchObject({ status: "invalid" });
    expect(future).toMatchObject({ status: "unsupported" });
    expect(malformed).not.toHaveProperty("sourceRecord");
    expect(future).not.toHaveProperty("sourceRecord");
  });
  test("constructs fresh grammar-ordered nested source values only after classification", () => {
    const [record] = parseProtonPassExport(
      source(
        login({
          data: {
            ...login().data,
            content: {
              ...(login().data as any).content,
              urls: ["https://example.test", "https://second.test"],
              autofillUrls: [
                { mode: 0, url: "https://example.test" },
                { mode: 0, url: "https://second.test" },
              ],
            },
          },
        }),
      ),
      limits,
    );
    expect(record).toMatchObject({ status: "supported" });
    if (record?.status === "supported") {
      expect(record.sourceRecord).toContain(
        '"urls":["https://example.test","https://second.test"]',
      );
      expect(record.sourceRecord).toContain(
        '"autofillUrls":[{"url":"https://example.test","mode":0},{"url":"https://second.test","mode":0}]',
      );
    }
  });
  test("retains every valid non-default URL mode as source provenance without fill URLs", () => {
    const [record] = parseProtonPassExport(
      source(
        login({
          data: {
            ...login().data,
            content: {
              ...(login().data as any).content,
              autofillUrls: [
                { url: "https://example.test", mode: 0 },
                ...[1, 2, 3, 4, 5, 6].map((mode) => ({
                  url: `mode-${mode}`,
                  mode,
                })),
              ],
            },
          },
        }),
      ),
      limits,
    );
    expect(record).toMatchObject({
      status: "supported",
      urls: ["https://example.test"],
    });
    if (record?.status === "supported")
      expect(record.sourceRecord).toContain('"url":"mode-6","mode":6');
  });
  test("rejects an archive before materializing a supported source record", () => {
    expect(() =>
      parseProtonPassExport(
        source(login({ files: ["attachment"] })),
        limits,
        new Set(),
      ),
    ).toThrow("archive is invalid");
  });
  test("forces numeric, share, display, and Base64 grammar boundaries", () => {
    const badState = parseProtonPassExport(
      source(login({ state: "1" })),
      limits,
    )[0];
    const shareMismatch = parseProtonPassExport(
      source(login({ shareId: "other" })),
      limits,
    )[0];
    const boundary = parseProtonPassExport(
      JSON.stringify({
        version: "1",
        vaults: {
          share: {
            description: "",
            display: { icon: 31, color: 11 },
            name: "Vault",
            items: [login()],
          },
        },
      }),
      limits,
    )[0];
    const futureColor = parseProtonPassExport(
      JSON.stringify({
        version: "1",
        vaults: {
          share: {
            description: "",
            display: { color: 12 },
            name: "Vault",
            items: [login()],
          },
        },
      }),
      limits,
    )[0];
    const malformedPasskey = parseProtonPassExport(
      source({
        ...login(),
        data: {
          ...login().data,
          content: {
            ...(login().data as any).content,
            passkeys: [
              {
                keyId: "AB==",
                content: "",
                credentialId: "",
                userHandle: "",
                domain: "",
                rpId: "",
                rpName: "",
                userName: "",
                userDisplayName: "",
                userId: "",
                note: "",
                createTime: 0,
              },
            ],
          },
        },
      }),
      limits,
    )[0];
    expect(badState).toMatchObject({ status: "invalid" });
    expect(shareMismatch).toMatchObject({ status: "invalid" });
    expect(boundary).toMatchObject({ status: "supported" });
    expect(futureColor).toMatchObject({ status: "unsupported" });
    expect(malformedPasskey).toMatchObject({ status: "invalid" });
  });
});
