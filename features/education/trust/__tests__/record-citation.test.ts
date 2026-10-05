import { citationIsOpenable, coerceTrustEnvelope, type SourceCitation } from "../types";
import { sourceRefFromCitation } from "../sourceRef";
import {
  cellsOfExcerpt,
  fieldLabelOfPart,
  recordCitationTarget,
  recordKindOf,
} from "../recordCitation";

const ID = "03f45e63-0ad7-4347-81af-c702460aeb2b";
const cite = (over: Partial<SourceCitation>): SourceCitation => ({
  sourceId: `${ID}:1`,
  sourceKind: "chunk",
  ...over,
});

describe("a conversation citation opens AT its message range", () => {
  it("names the messages (people count from 1) and links the range", () => {
    const t = recordCitationTarget(cite({ sourceId: `${ID}:m2-4`, url: `/chat/${ID}` }));
    expect(t).toMatchObject({ kind: "conversation", recordId: ID, label: "Messages 3–5" });
    expect(t?.messageRange).toEqual({ first: 2, last: 4 });
    expect(t?.href).toBe(`/chat/${ID}?messages=2-4`);
  });
  it("one message is 'Message N'", () => {
    expect(recordCitationTarget(cite({ sourceId: `${ID}:m0-0` }))?.label).toBe("Message 1");
  });
  it("is recognised from the part id alone (cards saved before the kind was stamped)", () => {
    expect(recordKindOf(cite({ sourceId: `${ID}:m0-0` }))).toBe("conversation");
  });
});

describe("a table citation opens AT its row", () => {
  const excerpt = "material: Batteries | weight_lbs: 331.89 | pickup_ref_link: PU-1022";
  it("names the row and filters the table to the cited cells", () => {
    const t = recordCitationTarget(cite({ recordKind: "table", sourceId: `${ID}:r12-12`, excerpt }));
    expect(t?.label).toBe("Row 12");
    expect(t?.href.startsWith(`/data/${ID}?filter=`)).toBe(true);
    const filter = JSON.parse(decodeURIComponent(t!.href.split("filter=")[1]!));
    expect(filter).toEqual({ material: "Batteries", weight_lbs: "331.89", pickup_ref_link: "PU-1022" });
  });
  it("a row line that names its row id opens that row", () => {
    const row = "11111111-2222-4333-8444-555555555555";
    const t = recordCitationTarget(cite({ recordKind: "table", sourceId: `${ID}:r2-2`, excerpt: `id: ${row} | material: Tin` }));
    expect(t?.href).toBe(`/data/${ID}?record=${row}`);
  });
  it("a row range is 'Rows a–b'", () => {
    expect(recordCitationTarget(cite({ recordKind: "table", sourceId: `${ID}:r1-40` }))?.label).toBe("Rows 1–40");
  });
  it("an old numeric part names no row — no invented label", () => {
    expect(recordCitationTarget(cite({ recordKind: "table", sourceId: `${ID}:1` }))?.label).toBeNull();
  });
  it("reads the cells of a row line", () => {
    expect(cellsOfExcerpt("a: 1 | b: two words")).toEqual({ a: "1", b: "two words" });
    expect(cellsOfExcerpt("no cells here")).toEqual({});
  });
});

describe("a pick list citation targets the cited choice", () => {
  it("opens the list page filtered to the choice and names it", () => {
    const t = recordCitationTarget(
      cite({ recordKind: "pick_list", sourceId: `${ID}:r3-3`, excerpt: "Aluminum: Light metal, recycled by weight" }),
    );
    expect(t?.label).toBe("Choice 3");
    expect(t?.href).toBe(`/lists/${ID}?filter=${encodeURIComponent('{"name":"Aluminum"}')}`);
  });
});

describe("a saved result citation opens AT its field", () => {
  it("names the field and carries it to the page", () => {
    const t = recordCitationTarget(cite({ recordKind: "saved_result", sourceId: `${ID}:cards-3` }));
    expect(t?.label).toBe("Card 3");
    expect(t?.href).toBe(`/shapes/instances/${ID}?field=cards-3`);
    expect(fieldLabelOfPart("summary")).toBe("Summary");
    expect(fieldLabelOfPart("1")).toBeNull();
  });
});

describe("a markdown document citation", () => {
  it("opens the document", () => {
    expect(recordCitationTarget(cite({ recordKind: "document", sourceId: `${ID}:2` }))?.href).toBe(`/documents/${ID}`);
  });
});

describe("what was broken before", () => {
  it("a record citation with no ids was not openable and had no source ref", () => {
    const c = cite({ sourceId: `${ID}:1` });
    expect(citationIsOpenable(c)).toBe(false);
    expect(sourceRefFromCitation(c)).toBeNull();
    expect(recordCitationTarget(c)).toBeNull();
  });
  it("the persisted record kind survives coercion", () => {
    const env = coerceTrustEnvelope({
      confidence: "grounded",
      citations: [{ sourceId: `${ID}:r1-1`, recordKind: "table" }],
    });
    expect(env?.citations[0]?.recordKind).toBe("table");
  });
});
