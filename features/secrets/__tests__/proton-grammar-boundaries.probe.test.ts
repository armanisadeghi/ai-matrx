import { parseProtonPassExport } from "../proton-pass";

const limits = {
  maxFileBytes: 100_000,
  maxRecords: 10,
  maxCellBytes: 10_000,
  maxJsonDepth: 64,
};

function login(overrides: Record<string, unknown> = {}) {
  return {
    itemId: "item",
    shareId: "share",
    data: {
      type: "login",
      content: {
        itemEmail: "",
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

function payload(item: object, vaultOverrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    version: "1",
    vaults: {
      share: {
        description: "",
        display: {},
        name: "Vault",
        items: [item],
        ...vaultOverrides,
      },
    },
  });
}

test("keeps malformed file declarations out of archive claims", () => {
  const malformed = login({ state: "1", files: ["attachment"] });
  expect(parseProtonPassExport(payload(malformed), limits, new Set())[0]).toMatchObject({
    status: "invalid",
  });
  expect(() =>
    parseProtonPassExport(payload(malformed), limits, new Set(["attachment"])),
  ).toThrow("archive is invalid");
});

test("lets structurally valid unsupported items participate in archive bijection", () => {
  const base = login();
  const unsupported = login({
    files: ["attachment"],
    data: { ...(base.data as object), type: "futureType" },
  });
  const [record] = parseProtonPassExport(
    payload(unsupported),
    limits,
    new Set(["attachment"]),
  );
  expect(record).toMatchObject({ status: "unsupported" });
  expect(record).not.toHaveProperty("sourceRecord");
});

test("closes vault and item objects without dropping unknown fields", () => {
  expect(() =>
    parseProtonPassExport(payload(login(), { future: true }), limits),
  ).toThrow("vault is invalid");
  const [record] = parseProtonPassExport(
    payload(login({ future: true })),
    limits,
  );
  expect(record).toMatchObject({ status: "unsupported" });
  expect(record).not.toHaveProperty("sourceRecord");
});

test("distinguishes missing, malformed, and future autofill URL grammar", () => {
  const base = login();
  const content = (base.data as any).content;
  const missing = { ...content };
  delete missing.autofillUrls;
  const legacy = parseProtonPassExport(
    payload(login({ data: { ...(base.data as object), content: missing } })),
    limits,
  )[0];
  const malformed = parseProtonPassExport(
    payload(
      login({
        data: {
          ...(base.data as object),
          content: { ...content, autofillUrls: [{ url: "x", mode: "0" }] },
        },
      }),
    ),
    limits,
  )[0];
  const future = parseProtonPassExport(
    payload(
      login({
        data: {
          ...(base.data as object),
          content: { ...content, autofillUrls: [{ url: "x", mode: 7 }] },
        },
      }),
    ),
    limits,
  )[0];
  expect(legacy).toMatchObject({ status: "unsupported" });
  expect(malformed).toMatchObject({ status: "invalid" });
  expect(future).toMatchObject({ status: "unsupported" });
});
