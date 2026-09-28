const postJson = jest.fn();
jest.mock("@/lib/python-client", () => ({ postJson: (...args: unknown[]) => postJson(...args) }));

import { createSourceRef, createSourceSet } from "@ai-matrx/agents/sources";
import { fetchSourceManifest, resolveSourceSet } from "./sourceSetApi";
import * as reviewApi from "./review/api";

/**
 * V1-A (verifier shot 03): a person with no organization selected picked a file and
 * saw "Sizes and parts could not be read: Select an organization before sending this
 * request." Both doors are reads the server admits without one (aidream
 * `read_by_access.py` BODY_CARRIED_READS), so the browser must send them as such —
 * never refuse them itself — and the review uses the same client.
 */
const set = createSourceSet([createSourceRef("file", "0b8d1a52-2f0c-4a57-9d2c-3a6f0e8f1c11")]);

beforeEach(() => {
  postJson.mockReset();
  postJson.mockResolvedValue({ data: { __kind: "source_manifest", sources: [] } });
});

it.each([
  ["manifest", () => fetchSourceManifest(set), "/sources/manifest"],
  ["resolve", () => resolveSourceSet(set), "/sources/resolve"],
  ["review manifest", () => reviewApi.fetchSourceManifest(set), "/sources/manifest"],
  ["review resolve", () => reviewApi.resolveSourceSet(set), "/sources/resolve"],
])("%s is sent as an organization-free read", async (_name, call, path) => {
  await call();
  expect(postJson).toHaveBeenCalledTimes(1);
  const [calledPath, body, options] = postJson.mock.calls[0]!;
  expect(calledPath).toBe(path);
  expect(body).toEqual({ source_set: set });
  expect(options).toMatchObject({ bodyCarriedRead: true });
  expect(options.organizationId).toBeUndefined();
});

it("still names an organization a host already resolved", async () => {
  await fetchSourceManifest(set, { organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b" });
  expect(postJson.mock.calls[0]![2]).toMatchObject({
    bodyCarriedRead: true,
    organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
  });
});
