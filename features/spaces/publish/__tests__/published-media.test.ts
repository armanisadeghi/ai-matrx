// A page's pictures go public with the page and back — but only the ones publishing made public.
import { decideMediaMove, mediaFileIds, readMarker, PUBLISHED_BY_KEY } from "../published-media";

const ID = "3d835813-4698-411c-bc35-d7900394fd7c";
const page = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

describe("decideMediaMove", () => {
  it("publishing makes a private picture public and records what it was", () => {
    expect(decideMediaMove({ visibility: "personal", published: false, metadata: {} }, page, true)).toEqual({
      kind: "publish",
      before: "personal",
      marker: { [page]: "personal" },
    });
  });

  it("a picture someone made public on purpose is left alone, and is never made private again", () => {
    const onPurpose = { visibility: "public", published: true, metadata: {} };
    expect(decideMediaMove(onPurpose, page, true)).toEqual({ kind: "none" });
    expect(decideMediaMove(onPurpose, page, false)).toEqual({ kind: "none" });
  });

  it("unpublishing puts back a picture publishing made public, to what it was", () => {
    const made = { visibility: "public", published: true, metadata: { [PUBLISHED_BY_KEY]: { [page]: "internal" } } };
    expect(decideMediaMove(made, page, false)).toEqual({ kind: "release", marker: {}, back: "internal" });
  });

  it("a picture two published pages share stays public until the last one comes down", () => {
    const shared = { visibility: "public", published: true, metadata: { [PUBLISHED_BY_KEY]: { [page]: "personal", [other]: "personal" } } };
    expect(decideMediaMove(shared, page, false)).toEqual({ kind: "drop", marker: { [other]: "personal" } });
    expect(decideMediaMove({ ...shared, metadata: { [PUBLISHED_BY_KEY]: { [other]: "personal" } } }, other, false)).toMatchObject({ kind: "release" });
  });

  it("a second page joins a picture the first one made public", () => {
    const first = { visibility: "public", published: true, metadata: { [PUBLISHED_BY_KEY]: { [other]: "personal" } } };
    expect(decideMediaMove(first, page, true)).toEqual({ kind: "share", marker: { [other]: "personal", [page]: "personal" } });
  });

  it("a page that never made the picture public cannot take it down", () => {
    const made = { visibility: "public", published: true, metadata: { [PUBLISHED_BY_KEY]: { [other]: "personal" } } };
    expect(decideMediaMove(made, page, false)).toEqual({ kind: "none" });
  });
});

describe("mediaFileIds / readMarker", () => {
  it("reads the uploaded files a snapshot names as cover and icon, and nothing else", () => {
    expect(mediaFileIds({ cover: { fileId: ID, offsetY: 50 }, icon: { icon: "Star" } })).toEqual([ID]);
    expect(mediaFileIds({ cover: { url: "gallery:solid-red" }, icon: { fileId: "not-an-id" } })).toEqual([]);
    expect(mediaFileIds(null)).toEqual([]);
  });
  it("ignores a malformed marker", () => {
    expect(readMarker({ [PUBLISHED_BY_KEY]: "x" })).toEqual({});
    expect(readMarker({ [PUBLISHED_BY_KEY]: { [page]: 5 } })).toEqual({});
  });
});
