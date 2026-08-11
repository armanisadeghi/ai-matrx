/**
 * The completed image `agent_call` must find its picture in every shape the
 * child agent can hand it back, and must NOT invent one when there is none.
 */

import { findResultMedia } from "../findResultMedia";

const FILE_ID = "6feae31a-945b-4dcc-8fc0-2041bb76c6b1";
const SIGNED_URL =
  `https://matrx-user-files.s3.amazonaws.com/4cf62e4e-2679-484f-b652-034e697418df/${FILE_ID}` +
  `?response-content-type=image%2Fpng&AWSAccessKeyId=AKIA1&Signature=x%3D&Expires=1786485620`;

test("the live agent_call payload resolves to the image by file_id", () => {
  expect(
    findResultMedia({
      agent_id: "bcc69216-d4fa-4e28-a090-8a7749123bc5",
      agent_name: "Matrx Image Ultra",
      result: SIGNED_URL,
      model_id: "0386fcae-1cf5-4d31-9a05-3b8ba61b2f3a",
    })?.file_id,
  ).toBe(FILE_ID);
});

test("a nested media_ref envelope resolves", () => {
  expect(
    findResultMedia({
      agent_name: "Matrx Image Ultra",
      result: { kind: "image_ref", media_ref: { file_id: FILE_ID, mime_type: "image/png" } },
    })?.file_id,
  ).toBe(FILE_ID);
});

test("a list of images shows the first", () => {
  expect(findResultMedia({ images: [SIGNED_URL, SIGNED_URL] })?.file_id).toBe(FILE_ID);
});

test("a bare url result resolves", () => {
  expect(findResultMedia(SIGNED_URL)?.file_id).toBe(FILE_ID);
});

test("no image → null, so the caller falls back to the honest generic view", () => {
  expect(
    findResultMedia({
      agent_name: "Matrx Image Ultra",
      result: "I could not generate that image.",
    }),
  ).toBeNull();
  expect(findResultMedia(null)).toBeNull();
  expect(findResultMedia({})).toBeNull();
});
