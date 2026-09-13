/** @jest-environment node */

import type { OnePuxWorkerResponse } from "../onepux.worker";

const limits = {
  maxFileBytes: 100_000,
  maxRecords: 10,
  maxCellBytes: 10_000,
  maxJsonDepth: 64,
};
async function archive(entries: Array<[string, string]>) {
  const { BlobWriter, TextReader, ZipWriter } = await import("@zip.js/zip.js");
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const [name, value] of entries)
    await writer.add(name, new TextReader(value));
  return writer.close();
}
function fixture() {
  const attributes = JSON.stringify({
    version: 3,
    description: "1Password Unencrypted Export",
    createdAt: 1,
  });
  const item = {
    uuid: "item-1",
    favIndex: 0,
    createdAt: 1,
    updatedAt: 1,
    state: "active",
    categoryUuid: "001",
    overview: {
      title: "Example",
      subtitle: "",
      url: "https://example.test",
      urls: [],
      tags: [],
    },
    details: {
      loginFields: [
        {
          id: "user",
          name: "username",
          value: "person",
          fieldType: "T",
          designation: "username",
        },
        {
          id: "pass",
          name: "password",
          value: "secret",
          fieldType: "P",
          designation: "password",
        },
      ],
    },
  };
  const data = JSON.stringify({
    accounts: [
      {
        attrs: {
          accountName: "Account",
          name: "Account",
          avatar: "",
          email: "a@example.test",
          uuid: "account-1",
          domain: "",
        },
        vaults: [
          {
            attrs: {
              uuid: "vault-1",
              desc: "",
              avatar: "",
              name: "Personal",
              type: "P",
            },
            items: [item],
          },
        ],
      },
    ],
  });
  return { attributes, data };
}
describe("1PUX worker production handler", () => {
  test("reads a real ZIP through the maintained archive reader and strict record parser", async () => {
    const { attributes, data } = fixture();
    const file = await archive([
      ["export.attributes", attributes],
      ["export.data", data],
      ["files/icon", "not imported"],
    ]);
    const responses: OnePuxWorkerResponse[] = [];
    const { createOnePuxWorkerMessageHandler } =
      await import("../onepux.worker");
    await createOnePuxWorkerMessageHandler((response) =>
      responses.push(response),
    )({ type: "parse", requestId: "request-1", file, limits });
    expect(responses).toEqual([
      expect.objectContaining({
        ok: true,
        requestId: "request-1",
        binaryMemberCount: 1,
        records: [
          expect.objectContaining({
            status: "supported",
            title: "Example",
            username: "person",
          }),
        ],
      }),
    ]);
  });
  test("returns a fixed source-free diagnostic for malformed archives", async () => {
    const responses: OnePuxWorkerResponse[] = [];
    const { createOnePuxWorkerMessageHandler } =
      await import("../onepux.worker");
    await createOnePuxWorkerMessageHandler((response) =>
      responses.push(response),
    )({ type: "parse", file: new Blob(["not a zip"]), limits });
    expect(responses).toEqual([
      {
        ok: false,
        requestId: undefined,
        error: "The 1Password archive could not be read.",
      },
    ]);
  });
  test("does not post a stale response after cancellation", async () => {
    const { attributes, data } = fixture();
    const file = await archive([
      ["export.attributes", attributes],
      ["export.data", data],
    ]);
    const responses: OnePuxWorkerResponse[] = [];
    const { createOnePuxWorkerMessageHandler } =
      await import("../onepux.worker");
    const handle = createOnePuxWorkerMessageHandler((response) =>
      responses.push(response),
    );
    const pending = handle({
      type: "parse",
      requestId: "request-1",
      file,
      limits,
    });
    await handle({ type: "cancel", requestId: "request-1" });
    await pending;
    expect(responses).toEqual([]);
  });
});
