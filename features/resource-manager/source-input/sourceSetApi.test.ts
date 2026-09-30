const postJson = jest.fn();
jest.mock("@/lib/python-client", () => ({ postJson: (...args: unknown[]) => postJson(...args) }));

import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { sourcesClient } from "./sourceSetApi";

/**
 * V1-A (verifier shot 03): a person with no organization selected picked a file and
 * saw "Sizes and parts could not be read: Select an organization before sending this
 * request." Both doors are reads the server admits without one (aidream
 * `read_by_access.py` BODY_CARRIED_READS). The package client marks every call
 * `bodyCarriedRead`; this proves the web app's transport carries the mark through
 * the typed `apiPost` to the one HTTP client, never refusing in the browser.
 */
const ref = createSourceRef("file", "0b8d1a52-2f0c-4a57-9d2c-3a6f0e8f1c11");
const set = createSourceSet([ref]);
const signal = new AbortController().signal;

beforeEach(() => {
  postJson.mockReset();
  postJson.mockResolvedValue({ data: { __kind: "source_manifest", sources: [] } });
});

it.each([
  ["manifest", () => sourcesClient.manifest(set), "/sources/manifest", { source_set: set }],
  ["resolve", () => sourcesClient.resolve(set), "/sources/resolve", { source_set: set }],
  ["review manifest", () => sourcesClient.manifest(set, { signal }), "/sources/manifest", { source_set: set }],
  [
    "part search",
    () => sourcesClient.searchParts(ref, "photosynthesis"),
    "/sources/parts/search",
    { source_ref: ref, query: "photosynthesis" },
  ],
])("%s is sent as an organization-free read", async (_name, call, path, sent) => {
  await call();
  expect(postJson).toHaveBeenCalledTimes(1);
  const [calledPath, body, options] = postJson.mock.calls[0]!;
  expect(calledPath).toBe(path);
  expect(body).toEqual(sent);
  expect(options).toMatchObject({ bodyCarriedRead: true });
  expect(options.organizationId).toBeUndefined();
});

it("still names an organization a host already resolved", async () => {
  await sourcesClient.manifest(set, { organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b" });
  expect(postJson.mock.calls[0]![2]).toMatchObject({
    bodyCarriedRead: true,
    organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  });
});

it("passes the review's AbortSignal through", async () => {
  await sourcesClient.manifest(set, { signal });
  expect(postJson.mock.calls[0]![2]).toMatchObject({ signal, bodyCarriedRead: true });
});
