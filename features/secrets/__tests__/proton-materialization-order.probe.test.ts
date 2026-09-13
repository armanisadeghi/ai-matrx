import { stringify } from "lossless-json";
import { parseProtonPassExport } from "../proton-pass";

jest.mock("lossless-json", () => {
  const actual = jest.requireActual("lossless-json");
  return { ...actual, stringify: jest.fn(actual.stringify) };
});

const limits = {
  maxFileBytes: 100_000,
  maxRecords: 10,
  maxCellBytes: 10_000,
  maxJsonDepth: 64,
};

const payload = JSON.stringify({
  version: "1",
  vaults: {
    share: {
      description: "",
      display: {},
      name: "Vault",
      items: [
        {
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
        },
      ],
    },
  },
});

test("does not materialize source records before archive bijection succeeds", () => {
  const stringifySpy = stringify as jest.MockedFunction<typeof stringify>;
  stringifySpy.mockClear();
  expect(() =>
    parseProtonPassExport(payload, limits, new Set(["unclaimed-binary"])),
  ).toThrow("archive is invalid");
  expect(stringifySpy).not.toHaveBeenCalled();
});
