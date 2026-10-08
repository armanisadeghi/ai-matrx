import { initialsOf, needsNewSigningPage, readFieldMap, rotateBox } from "./fieldMap";

describe("readFieldMap", () => {
  it("reads the frozen contract shape and orders fields page, then top to bottom", () => {
    const fields = readFieldMap({
      field_map: {
        fields: [
          { id: "b", signer_id: "s1", kind: "date_signed", page: 2, x: 0.1, y: 0.2, w: 0.16, h: 0.035 },
          { id: "a", signer_id: "s1", kind: "signature", page: 1, x: 0.5, y: 0.8, w: 0.25, h: 0.06 },
          { id: "c", signer_id: "s2", kind: "initials", page: 1, x: 0.1, y: 0.1, w: 0.08, h: 0.05 },
        ],
      },
    });
    expect(fields.map((f) => f.id)).toEqual(["c", "a", "b"]);
    expect(fields[1]).toEqual({ id: "a", signerId: "s1", kind: "signature", page: 1, x: 0.5, y: 0.8, w: 0.25, h: 0.06 });
  });

  it("answers no fields for an empty map and drops only the malformed field", () => {
    expect(readFieldMap({ field_map: {} })).toEqual([]);
    expect(readFieldMap({})).toEqual([]);
    const fields = readFieldMap({
      field_map: {
        fields: [
          { id: "bad-kind", signer_id: "s1", kind: "stamp", page: 1, x: 0, y: 0, w: 0.1, h: 0.1 },
          { id: "bad-x", signer_id: "s1", kind: "signature", page: 1, x: 1.5, y: 0, w: 0.1, h: 0.1 },
          { id: "bad-page", signer_id: "s1", kind: "signature", page: 0, x: 0, y: 0, w: 0.1, h: 0.1 },
          { id: "ok", signer_id: "s1", kind: "full_name", page: 1, x: 0, y: 0, w: 0.1, h: 0.1 },
        ],
      },
    });
    expect(fields.map((f) => f.id)).toEqual(["ok"]);
  });
});

describe("initialsOf", () => {
  it("takes the first letter of each word of the full name", () => {
    expect(initialsOf("  mary ann  smith ")).toBe("MAS");
    expect(initialsOf("")).toBe("");
  });
});

describe("rotateBox", () => {
  it("keeps the box on the same corner of the page as the page turns", () => {
    const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.05 };
    expect(rotateBox(box, 0)).toEqual(box);
    const r90 = rotateBox(box, 90);
    expect(r90.x).toBeCloseTo(0.75);
    expect(r90.y).toBeCloseTo(0.1);
    expect(r90.w).toBeCloseTo(0.05);
    expect(r90.h).toBeCloseTo(0.3);
    const r180 = rotateBox(box, 180);
    expect(r180.x).toBeCloseTo(0.6);
    expect(r180.y).toBeCloseTo(0.75);
    const r270 = rotateBox(box, 270);
    expect(r270.x).toBeCloseTo(0.2);
    expect(r270.y).toBeCloseTo(0.6);
  });
});

describe("needsNewSigningPage", () => {
  it("refuses a v2 map and any field kind this page cannot draw", () => {
    expect(needsNewSigningPage({ field_map: { schema_version: 2, fields: [], groups: [] } })).toBe(true);
    expect(
      needsNewSigningPage({
        field_map: { fields: [{ id: "t", signer_id: "s1", kind: "text", page: 1, x: 0, y: 0, w: 0.1, h: 0.1 }] },
      }),
    ).toBe(true);
  });

  it("accepts a v1 map and a document with no fields", () => {
    expect(needsNewSigningPage({ field_map: {} })).toBe(false);
    expect(needsNewSigningPage({})).toBe(false);
    expect(
      needsNewSigningPage({
        field_map: { fields: [{ id: "a", signer_id: "s1", kind: "signature", page: 1, x: 0, y: 0, w: 0.1, h: 0.1 }] },
      }),
    ).toBe(false);
  });
});
