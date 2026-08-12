import {
  parseOpenEntityEditorWrite,
  parseSourceTypeIdWrite,
} from "./entity-write-targets";

const OFFERED = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
];

describe("parseSourceTypeIdWrite", () => {
  it("accepts an offered category id", () => {
    expect(parseSourceTypeIdWrite(OFFERED[1], "entity_draft", OFFERED)).toBe(
      OFFERED[1],
    );
  });

  it("trims before matching", () => {
    expect(
      parseSourceTypeIdWrite(` ${OFFERED[0]} `, "entity_draft", OFFERED),
    ).toBe(OFFERED[0]);
  });

  it("keeps an explicit null (the picker's None)", () => {
    expect(parseSourceTypeIdWrite(null, "entity_draft", OFFERED)).toBeNull();
  });

  it("refuses an id the picker does not offer", () => {
    expect(() =>
      parseSourceTypeIdWrite("not-a-real-id", "entity_draft", OFFERED),
    ).toThrow(/is not one of this workspace's plan_source_type category ids/);
  });

  it("refuses while the options are still loading, rather than trusting", () => {
    expect(() =>
      parseSourceTypeIdWrite(OFFERED[0], "entity_draft", []),
    ).toThrow(/have not loaded yet/);
  });

  it("refuses a non-string", () => {
    expect(() => parseSourceTypeIdWrite(42, "entity_draft", OFFERED)).toThrow(
      /must be a category UUID from source_type_options/,
    );
  });

  it("refuses an empty string and points at null", () => {
    expect(() => parseSourceTypeIdWrite("  ", "entity_draft", OFFERED)).toThrow(
      /Send null to clear the source type/,
    );
  });

  it("names the calling target in its errors", () => {
    expect(() => parseSourceTypeIdWrite(7, "some_target", OFFERED)).toThrow(
      /^some_target:/,
    );
  });
});

describe("parseOpenEntityEditorWrite", () => {
  const ids = ["aaa", "bbb"];

  it("returns null for a blank New entity dialog", () => {
    expect(parseOpenEntityEditorWrite(null, ids)).toBeNull();
    expect(parseOpenEntityEditorWrite("", ids)).toBeNull();
  });

  it("returns a live entity id, trimmed", () => {
    expect(parseOpenEntityEditorWrite(" bbb ", ids)).toBe("bbb");
  });

  it("refuses an id that is not on the roster", () => {
    expect(() => parseOpenEntityEditorWrite("ccc", ids)).toThrow(
      /is not a live entity on this site/,
    );
  });

  it("refuses a non-string id", () => {
    expect(() => parseOpenEntityEditorWrite(42, ids)).toThrow(
      /expected an entity UUID/,
    );
  });
});
